//! Domestic edition updates from `juner122king/WestPlay` GitHub Releases: each release's `latest.json`
//! (configured under `plugins.updater.endpoints` in `tauri.conf.json`) names the signed NSIS installer and
//! its minisign signature, verified here against the domestic edition's public key with
//! `requireSignedVersion`. An update is checked shortly after startup, periodically afterwards, and when
//! requested by the companion (`About` page). Found updates are announced via `update-found` and installed
//! only when confirmed by the player ([`install_update`]) with the game closed.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::utils::config::PluginConfig;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, Updater, UpdaterExt};
use westplay_host::log;

/// The first look, once WestPlay has started (not to slow its start).
const FIRST_LOOK: Duration = Duration::from_secs(30);
/// Then this often.
const EVERY: Duration = Duration::from_secs(6 * 60 * 60);
/// After a look that couldn't be made (no network, GitHub not answering, no release yet): again this soon.
const RETRY: Duration = Duration::from_secs(30 * 60);

/// The update found, if one was.
#[derive(Default)]
pub struct Updates(pub Mutex<Option<Update>>);

/// An update, as the companion offers it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    version: String,
    /// What's new: the changelog's notes for it (Markdown, a list).
    notes: String,
    /// When it was released, `YYYY-MM-DD`.
    date: Option<String>,
}

impl From<&Update> for Offer {
    fn from(update: &Update) -> Self {
        Self {
            version: update.version.clone(),
            notes: update.body.clone().unwrap_or_default(),
            date: update.date.map(|date| date.date().to_string()),
        }
    }
}

/// How far the download is, for the companion.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    done: u64,
    total: Option<u64>,
}

/// Returns true only when the updater plugin has both a non-empty public key and at least one endpoint.
fn updater_configured(plugins: &PluginConfig) -> bool {
    let Some(updater) = plugins.0.get("updater") else {
        return false;
    };
    let pubkey_ok = updater.get("pubkey").and_then(|v| v.as_str()).is_some_and(|s| !s.trim().is_empty());
    let endpoints_ok = updater
        .get("endpoints")
        .and_then(|v| v.as_array())
        .is_some_and(|items| items.iter().any(|item| item.as_str().is_some_and(|s| !s.trim().is_empty())));
    pubkey_ok && endpoints_ok
}

/// Optional debug-only endpoint override (`WESTPLAY_DEV_UPDATE_ENDPOINT`) for local E2E testing.
#[cfg(debug_assertions)]
fn dev_update_endpoint() -> Option<String> {
    std::env::var("WESTPLAY_DEV_UPDATE_ENDPOINT").ok().map(|s| s.trim().to_owned()).filter(|s| !s.is_empty())
}

fn build_updater(app: &AppHandle) -> Result<Updater, String> {
    let handle = app.clone();
    let builder = app.updater_builder().on_before_exit(move || crate::stop_host(&handle));
    #[cfg(debug_assertions)]
    let builder = if let Some(endpoint) = dev_update_endpoint() {
        let url: tauri::Url = endpoint.parse().map_err(|e| format!("invalid dev update endpoint: {e}"))?;
        builder.endpoints(vec![url]).map_err(|e| e.to_string())?
    } else {
        builder
    };
    builder.build().map_err(|e| e.to_string())
}

fn active_in_this_build() -> bool {
    #[cfg(debug_assertions)]
    {
        dev_update_endpoint().is_some()
    }
    #[cfg(not(debug_assertions))]
    {
        true
    }
}

/// Whether the domestic edition has online update checking configured.
#[tauri::command]
pub fn online_updates_enabled(app: AppHandle) -> bool {
    updater_configured(&app.config().plugins)
}

/// Looks for updates in the background: shortly after startup, then periodically.
pub fn watch(app: &AppHandle) {
    if !active_in_this_build() || !updater_configured(&app.config().plugins) {
        return;
    }
    let app = app.clone();
    let looking = std::thread::Builder::new().name("westplay-updates".into()).spawn(move || {
        std::thread::sleep(FIRST_LOOK);
        loop {
            let looked = tauri::async_runtime::block_on(look(&app));
            std::thread::sleep(if looked.is_ok() { EVERY } else { RETRY });
        }
    });
    if let Err(error) = looking {
        log!("[update] couldn't start looking for updates: {error}");
    }
}

/// Checks the configured endpoint for an update, stores it for [`install_update`], and notifies the companion.
async fn look(app: &AppHandle) -> Result<Option<Offer>, String> {
    let updater = match build_updater(app) {
        Ok(updater) => updater,
        Err(error) => {
            log!("[update] the updater isn't set up: {error}");
            return Err(error);
        }
    };
    let found = match updater.check().await {
        Ok(found) => found,
        Err(error) => {
            log!("[update] couldn't look for an update: {error}");
            return Err(error.to_string());
        }
    };
    let offer = found.as_ref().map(Offer::from);
    // Kept before the companion's told, so an Update straight away finds it.
    *app.state::<Updates>().0.lock().unwrap_or_else(|e| e.into_inner()) = found;
    if let Some(offer) = &offer {
        log!("[update] WestPlay {} is available", offer.version);
        let _ = app.emit("update-found", offer);
    }
    Ok(offer)
}

/// The update found so far, if there's one (the companion asks when it opens: `update-found` may have come
/// before it was listening).
#[tauri::command]
pub fn update_offer(updates: State<Updates>) -> Option<Offer> {
    updates.0.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(Offer::from)
}

/// Looks for an update now (the companion, as it opens, and its About page). A development build returns
/// `Ok(None)` unless `WESTPLAY_DEV_UPDATE_ENDPOINT` is configured.
#[tauri::command]
pub async fn look_for_update(app: AppHandle) -> Result<Option<Offer>, String> {
    if !active_in_this_build() {
        return Ok(None);
    }
    look(&app).await
}

/// Installs the update found: downloaded, its signature and version checked, then Windows' installer runs in
/// passive mode and WestPlay quits for it (the installer starts it again). Only with the game closed: the
/// plugin the game loaded is the old WestPlay's.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    if westplay_setup::game::running() {
        return Err("gameRunning".into());
    }
    let update = app.state::<Updates>().0.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let update = update.ok_or("noUpdate")?;
    log!("[update] installing WestPlay {}", update.version);
    let mut done = 0u64;
    let mut shown = None;
    let bytes = update
        .download(
            |chunk, total| {
                done += chunk as u64;
                // Told in whole percents, not for every chunk.
                let percent = total.map(|total| done * 100 / total.max(1));
                if percent != shown || total.is_none() {
                    shown = percent;
                    let _ = app.emit("update-progress", Progress { done, total });
                }
            },
            || {},
        )
        .await
        .map_err(|error| {
            log!("[update] couldn't download it: {error}");
            error.to_string()
        })?;
    update.install(bytes).map_err(|error| {
        log!("[update] couldn't install it: {error}");
        error.to_string()
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use serde_json::json;

    use super::*;

    #[test]
    fn updater_configured_requires_non_empty_pubkey_and_endpoint() {
        let empty = PluginConfig(HashMap::new());
        assert!(!updater_configured(&empty));

        let missing_key = PluginConfig(HashMap::from([(
            "updater".into(),
            json!({ "pubkey": " ", "endpoints": ["https://example.com/latest.json"] }),
        )]));
        assert!(!updater_configured(&missing_key));

        let missing_endpoints =
            PluginConfig(HashMap::from([("updater".into(), json!({ "pubkey": "abc", "endpoints": [] }))]));
        assert!(!updater_configured(&missing_endpoints));

        let valid = PluginConfig(HashMap::from([(
            "updater".into(),
            json!({
                "pubkey": "abc",
                "endpoints": ["https://github.com/juner122king/WestPlay/releases/latest/download/latest.json"]
            }),
        )]));
        assert!(updater_configured(&valid));
    }

    #[test]
    fn tauri_config_enables_domestic_github_updater() {
        let raw = include_str!("../tauri.conf.json");
        let config: tauri::utils::config::Config = serde_json::from_str(raw).expect("valid tauri.conf.json");
        assert!(updater_configured(&config.plugins));
        let updater = &config.plugins.0["updater"];
        assert_eq!(
            updater["endpoints"][0],
            "https://github.com/juner122king/WestPlay/releases/latest/download/latest.json"
        );
        assert_eq!(updater["requireSignedVersion"], true);
        assert_eq!(updater["windows"]["installMode"], "passive");
        // Must not point to upstream or use upstream's pubkey.
        assert_ne!(
            updater["pubkey"].as_str().unwrap_or_default(),
            "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDU2OTc1ODBDNjdDNTc3Q0UKUldUT2Q4Vm5ERmlYVnQvV0dLdVVNUWtlcjlpKzB3MVVNeVJVeHhXNHFGVUNaU2xpVDNNVjhkWmEK"
        );
    }

    #[test]
    fn offer_and_progress_serialize_in_camel_case() {
        let offer = Offer {
            version: "2.4.0-domestic.2".into(),
            notes: "- Added auto-updater".into(),
            date: Some("2026-11-17".into()),
        };
        assert_eq!(
            serde_json::to_value(&offer).unwrap(),
            json!({
                "version": "2.4.0-domestic.2",
                "notes": "- Added auto-updater",
                "date": "2026-11-17"
            })
        );
        let progress = Progress { done: 512, total: Some(1024) };
        assert_eq!(serde_json::to_value(&progress).unwrap(), json!({ "done": 512, "total": 1024 }));
    }
}
