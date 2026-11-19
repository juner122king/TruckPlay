//! Ximalaya (ximalaya.com) in a hidden WebView2.
//! Controlled by WestPlay's cabin UI (ui/src/cabin/apps/ximalaya).

use std::cell::{Cell, RefCell};
use std::path::Path;

use crate::signin::{self, Progress, SignInWindow};
use crate::speakers::{self, CabCache, Equalizer, Head, Speaker};
use crate::webview::{self, OffscreenWebView, Stage};

pub const HOME: &str = "https://www.ximalaya.com/";

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Command {
    Start,
    SignIn,
    SignOut,
    Play {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        track: Option<Track>,
        #[serde(default, rename = "requestId", skip_serializing_if = "Option::is_none")]
        request_id: Option<u32>,
    },
    Pause {
        #[serde(default, rename = "requestId", skip_serializing_if = "Option::is_none")]
        request_id: Option<u32>,
    },
    Speed {
        rate: f64,
    },
    Next,
    Previous,
    Seek {
        seconds: f64,
    },
    Volume {
        percent: f64,
    },
    Ask {
        id: u32,
        question: Question,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "ask", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Question {
    Search { query: String },
    Recommend,
    Category { category: String },
    AlbumTracks { album_id: String },
    RadioHome,
    RadioList { location_id: u32, location_type_id: u8, category_id: u32, page_num: u32 },
    RadioDetail { radio_id: u32 },
    RadioSchedule { radio_id: u32 },
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    #[serde(default)]
    pub duration: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default)]
    pub radio: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radio_id: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playback {
    pub title: String,
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    pub duration: f64,
    pub position: f64,
    pub status: String,
    #[serde(default)]
    pub owner: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radio_id: Option<u32>,
    #[serde(default)]
    pub is_live: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_id: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub signed_in: bool,
    pub playing: bool,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
    pub id: u32,
    #[serde(default)]
    pub failed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracks: Option<Vec<Track>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub albums: Option<Vec<Album>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radio: Option<serde_json::Value>,
}

#[derive(Debug, PartialEq)]
pub enum Report {
    State(State),
    SignInWindow(bool),
    Playback(Option<Playback>),
    Answer(Answer),
    Spectrum(Vec<u8>),
}

pub struct Ximalaya {
    view: OffscreenWebView,
    sign_in: RefCell<Option<SignInWindow>>,
    pending: RefCell<Vec<Report>>,
    ready: Cell<bool>,
    commands: RefCell<Vec<String>>,
    told: RefCell<CabCache>,
}

impl Ximalaya {
    pub fn start(stage: &Stage, width: u32, height: u32, user_data: &Path) -> Result<Self, webview::Error> {
        let view = OffscreenWebView::new(stage, width, height, user_data)?;
        view.log_as("ximalaya")?;
        view.show(false)?;
        stage.add(&view, false)?;
        view.add_startup_script(concat!(
            include_str!("cab_sound.js"),
            "\n",
            include_str!("ximalaya_hls.js"),
            "\n",
            include_str!("ximalaya.js")
        ))?;
        view.serve_blank_document(HOME)?;
        view.navigate(HOME)?;
        Ok(Self {
            view,
            sign_in: RefCell::new(None),
            pending: RefCell::new(Vec::new()),
            ready: Cell::new(false),
            commands: RefCell::new(Vec::new()),
            told: RefCell::default(),
        })
    }

    pub fn view(&self) -> &OffscreenWebView {
        &self.view
    }

    #[allow(dead_code)]
    pub fn failed(&self) -> bool {
        self.view.take_failure().is_some()
    }

    #[allow(dead_code)]
    pub fn close(self, stage: &Stage) {
        let _ = stage.remove(&self.view);
    }

    pub fn command(&self, command: &Command) {
        if matches!(command, Command::SignIn) {
            self.sign_in();
            return;
        }
        if matches!(command, Command::SignOut) {
            let _ = self.view.delete_cookies();
            self.ready.set(false);
            self.told.borrow_mut().reset();
            let _ = self.view.navigate(HOME);
            return;
        }
        if let Ok(json) = serde_json::to_string(command) {
            self.send_or_queue(json);
        }
    }

    fn send_or_queue(&self, json: String) {
        if self.ready.get() {
            let _ = self.view.post_json(&json);
        } else {
            self.commands.borrow_mut().push(json);
        }
    }

    pub fn sign_in(&self) {
        if self.sign_in.borrow().as_ref().is_some_and(|w| w.progress() == Progress::Signing) {
            if let Some(window) = self.sign_in.borrow().as_ref() {
                window.bring_forward();
            }
            return;
        }
        match SignInWindow::open(self.view.environment(), &signin::XIMALAYA) {
            Ok(window) => {
                *self.sign_in.borrow_mut() = Some(window);
                self.pending.borrow_mut().push(Report::SignInWindow(true));
            }
            Err(e) => {
                crate::log!("[ximalaya] sign-in window failed: {e}");
            }
        }
    }

    pub fn take_reports(&self) -> Vec<Report> {
        let mut reports = std::mem::take(&mut *self.pending.borrow_mut());

        let progress = self.sign_in.borrow().as_ref().map(SignInWindow::progress);
        if let Some(progress @ (Progress::SignedIn | Progress::Closed)) = progress {
            self.sign_in.borrow_mut().take();
            reports.push(Report::SignInWindow(false));
            if progress == Progress::SignedIn {
                self.ready.set(false);
                self.told.borrow_mut().reset();
                let _ = self.view.navigate(HOME);
            }
        }

        for message in self.view.take_page_messages() {
            if let Some(bars) = speakers::read_spectrum(&message) {
                reports.push(Report::Spectrum(bars));
                continue;
            }
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&message) {
                let msg_type = value.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match msg_type {
                    "ready" => {
                        self.ready.set(true);
                        for command in self.commands.borrow_mut().drain(..) {
                            let _ = self.view.post_json(&command);
                        }
                    }
                    "spectrum" => {
                        if let Some(bars) =
                            value.get("bars").and_then(|v| serde_json::from_value::<Vec<u8>>(v.clone()).ok())
                        {
                            reports.push(Report::Spectrum(bars));
                        }
                    }
                    "state" => {
                        if let Some(state_val) = value.get("state") {
                            if let Ok(s) = serde_json::from_value::<State>(state_val.clone()) {
                                reports.push(Report::State(s));
                            }
                        }
                    }
                    "playback" => {
                        let pb = value.get("playback").and_then(|p| serde_json::from_value::<Playback>(p.clone()).ok());
                        reports.push(Report::Playback(pb));
                    }
                    "answer" => {
                        if let Some(ans_val) = value.get("answer") {
                            if let Ok(a) = serde_json::from_value::<Answer>(ans_val.clone()) {
                                reports.push(Report::Answer(a));
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        reports
    }

    pub fn cab(
        &self,
        speakers: Option<&[Speaker]>,
        head: Head,
        outside: bool,
        distance: f32,
        equalizer: Equalizer,
        spectrum: bool,
    ) -> windows::core::Result<()> {
        if let Some(message) =
            self.told.borrow_mut().message_if_changed(speakers, head, outside, distance, equalizer, spectrum)
        {
            self.send_or_queue(message);
        }
        Ok(())
    }
}

pub fn state_message(state: Option<&State>, signing_in: bool) -> String {
    let signed_in = state.map(|s| s.signed_in);
    let playing = state.map(|s| s.playing);
    serde_json::json!({
        "type": "ximalaya",
        "signedIn": signed_in,
        "playing": playing,
        "signingIn": signing_in,
    })
    .to_string()
}

pub fn playback_message(playback: Option<&Playback>) -> String {
    serde_json::json!({
        "type": "ximalayaPlayback",
        "playback": playback,
    })
    .to_string()
}

pub fn answer_message(answer: &Answer) -> String {
    serde_json::json!({
        "type": "ximalayaAnswer",
        "id": answer.id,
        "failed": answer.failed,
        "error": answer.error,
        "tracks": answer.tracks,
        "albums": answer.albums,
        "radio": answer.radio,
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn radio_commands_use_camel_case_and_keep_the_target() {
        let command = Command::Play {
            track: Some(Track {
                id: "radio-1011".into(),
                title: "Music".into(),
                artist: "Station".into(),
                album: None,
                artwork: None,
                duration: 0.0,
                url: None,
                radio: true,
                radio_id: Some(1011),
            }),
            request_id: Some(42),
        };
        let json = serde_json::to_value(command).unwrap();
        assert_eq!(json["action"], "play");
        assert_eq!(json["requestId"], 42);
        assert_eq!(json["track"]["radioId"], 1011);
        let ask = serde_json::to_value(Question::RadioList {
            location_id: 310000,
            location_type_id: 0,
            category_id: 14,
            page_num: 2,
        })
        .unwrap();
        assert_eq!(
            ask,
            serde_json::json!({ "ask": "radioList", "locationId": 310000, "locationTypeId": 0, "categoryId": 14, "pageNum": 2 })
        );
    }

    #[test]
    #[ignore = "uses network and isolated WebView2 live audio"]
    fn live_radio_plays_in_webview2() {
        use windows::Win32::System::Com::{COINIT_APARTMENTTHREADED, CoInitializeEx};
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().unwrap() };
        let profile = std::env::temp_dir().join(format!("westplay-radio-probe-{}", std::process::id()));
        let stage = Stage::new(1280, 720).unwrap();
        let player = Ximalaya::start(&stage, 1280, 720, &profile).unwrap();
        fn wait(player: &Ximalaya, seconds: u64, mut condition: impl FnMut(&Report) -> bool) -> bool {
            let until = std::time::Instant::now() + std::time::Duration::from_secs(seconds);
            while std::time::Instant::now() < until {
                crate::pump_messages();
                for report in player.take_reports() {
                    println!("{report:?}");
                    if condition(&report) {
                        return true;
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            false
        }
        // The first command deliberately precedes readiness: it must survive a cold host start.
        for (index, id) in [1011, 1789, 93].into_iter().enumerate() {
            let request = index as u32 + 1;
            player.command(&Command::Play {
                request_id: Some(request),
                track: Some(Track {
                    id: format!("radio-{id}"),
                    title: "Live probe".into(),
                    artist: "Radio".into(),
                    album: None,
                    artwork: None,
                    duration: 0.0,
                    url: None,
                    radio: true,
                    radio_id: Some(id),
                }),
            });
            assert!(wait(&player, 45, |report| matches!(report, Report::Playback(Some(p)) if p.request_id == Some(request) && p.status == "playing" && p.radio_id == Some(id))), "station {id} did not start: {}", player.view.evaluate("({url: location.href, ready: document.readyState, audio: [...document.querySelectorAll('audio')].map(a=>({src:a.currentSrc, paused:a.paused, state:a.readyState,error:a.error?.message}))})").unwrap());
            let audio: serde_json::Value = serde_json::from_str(&player.view.evaluate("({count: document.querySelectorAll('#wp-ximalaya-audio').length, rate:document.getElementById('wp-ximalaya-audio').playbackRate})").unwrap()).unwrap();
            assert_eq!(audio["count"], 1);
            assert_eq!(audio["rate"], 1);
        }
        player.command(&Command::Pause { request_id: Some(4) });
        assert!(wait(
            &player,
            3,
            |report| matches!(report, Report::Playback(Some(p)) if p.request_id == Some(4) && p.status == "paused")
        ));
        assert!(!wait(&player, 6, |report| matches!(report, Report::Playback(Some(p)) if p.status == "playing")));
        player.close(&stage);
    }

    #[test]
    fn old_playback_reports_default_to_vod() {
        let old: Playback = serde_json::from_value(serde_json::json!({ "title": "Episode", "artist": "Reader", "duration": 10, "position": 2, "status": "playing" })).unwrap();
        assert_eq!(old.owner, "");
        assert!(!old.is_live);
        assert_eq!(old.radio_id, None);
    }
}
