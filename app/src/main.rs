//! WestPlay app: the companion window (Tauri) plus the in-cabin UI host on its own thread.

// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod customize;
mod maps;
mod setup;
mod update;

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use setup::SetupStore;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewWindow, WindowEvent};
use westplay_host::maps::SetUpGame;
use westplay_host::settings::{Settings, SettingsFile, SharedSettings};
use westplay_host::{
    AccountAction, AccountRequests, BrowserGone, Config, Content, OpenRequest, SCREEN_HEIGHT, SCREEN_WIDTH, Status,
};

const TRAY_ID: &str = "main-tray";

struct Host {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

/// Companion window startup, tray persistence, and single-instance wakeup state.
struct WindowLifecycle {
    keep_in_tray: Arc<AtomicBool>,
    quitting: Arc<AtomicBool>,
    startup_handled: AtomicBool,
    woken_early: AtomicBool,
    start_minimized: bool,
}

/// Requests from the companion window to open or close WestPlay on the truck's screen (the cabin page owns
/// that state, which it also changes itself: its sidebar's truck button, its WestPlay button, the interaction
/// key and W; the host reports it back in its status).
struct WestplayOpen(Arc<OpenRequest>);

/// The companion's sign-ins and sign-outs (YouTube, Spotify, Apple Music), for the host.
struct Accounts(Arc<AccountRequests>);

/// The player's settings: kept on disk, applied live by the host thread, changed from the companion window.
struct SettingsStore {
    file: SettingsFile,
    shared: Arc<SharedSettings>,
}

/// The companion window starts hidden and shows once its page has drawn its first screen
/// (`companion_ready`), so it never shows blank while the page loads; after this long it shows anyway.
const SHOW_ANYWAY: Duration = Duration::from_secs(8);

/// The companion's page has drawn its first screen: apply the configured startup visibility once.
#[tauri::command]
fn companion_ready(app: AppHandle) {
    apply_initial_visibility(&app, false);
}

fn apply_initial_visibility(app: &AppHandle, fallback: bool) {
    let Some(lifecycle) = app.try_state::<WindowLifecycle>() else {
        return;
    };
    if lifecycle.startup_handled.swap(true, Ordering::AcqRel) {
        return;
    }
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let woken = lifecycle.woken_early.load(Ordering::Acquire);
    let keep_in_tray = lifecycle.keep_in_tray.load(Ordering::Acquire);
    if !woken && lifecycle.start_minimized {
        if keep_in_tray {
            westplay_host::startup::mark("app: started in system tray");
            return;
        }
        westplay_host::startup::mark("app: started minimized");
        if let Ok(hwnd) = window.hwnd() {
            westplay_host::companion_window::show_minimized_no_activate(hwnd.0 as isize);
        } else {
            let _ = window.minimize();
        }
        return;
    }
    if !window.is_visible().unwrap_or(false) {
        westplay_host::startup::mark(if fallback {
            "app: window shown without its page ready"
        } else {
            "app: window shown"
        });
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Brings the companion window up from the tray, taskbar, or background and focuses it.
fn show_main_window(app: &AppHandle) {
    if let Some(lifecycle) = app.try_state::<WindowLifecycle>() {
        lifecycle.woken_early.store(true, Ordering::Release);
        lifecycle.startup_handled.store(true, Ordering::Release);
    }
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(window) = handle.get_webview_window("main") else {
            return;
        };
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        let _ = window.show();
        let _ = window.set_focus();
        if let Ok(hwnd) = window.hwnd() {
            westplay_host::companion_window::force_foreground(hwnd.0 as isize);
        }
    });
}

#[tauri::command]
fn window_minimize(window: WebviewWindow, lifecycle: State<WindowLifecycle>) {
    if lifecycle.keep_in_tray.load(Ordering::Acquire) {
        let _ = window.hide();
    } else {
        let _ = window.minimize();
    }
}

#[tauri::command]
fn window_close(window: WebviewWindow, lifecycle: State<WindowLifecycle>) {
    if lifecycle.keep_in_tray.load(Ordering::Acquire) {
        let _ = window.hide();
    } else {
        let _ = window.close();
    }
}

#[tauri::command]
fn window_start_dragging(window: WebviewWindow) {
    let _ = window.start_dragging();
}

/// Whether the companion's window is the one in front. Windows' word: the page's own `document.hasFocus()` says
/// yes while the window comes up behind another.
#[tauri::command]
fn window_in_front(window: WebviewWindow) -> bool {
    window.hwnd().is_ok_and(|window| westplay_host::in_front(window.0 as isize))
}

/// The companion's page held its room still, or set it going again: for a log to tell what the room cost.
#[tauri::command]
fn room_held(held: bool) {
    westplay_host::log!("companion: {}", if held { "behind, its room held still" } else { "in front, its room going" });
}

#[tauri::command]
fn set_westplay_open(open: bool, request: State<WestplayOpen>) {
    request.0.request(open);
}

/// Opens Google's sign-in for YouTube in a window on the desktop (the status then says when it's done).
#[tauri::command]
fn youtube_sign_in(accounts: State<Accounts>) {
    accounts.0.youtube.request(AccountAction::SignIn);
}

/// Signs YouTube out.
#[tauri::command]
fn youtube_sign_out(accounts: State<Accounts>) {
    accounts.0.youtube.request(AccountAction::SignOut);
}

/// Runs YouTube (hidden), so the status says whether it's signed in.
#[tauri::command]
fn youtube_check(accounts: State<Accounts>) {
    accounts.0.youtube.request(AccountAction::Check);
}

#[tauri::command]
fn bilibili_sign_in(accounts: State<Accounts>) {
    accounts.0.bilibili.request(AccountAction::SignIn);
}

#[tauri::command]
fn bilibili_sign_out(accounts: State<Accounts>) {
    accounts.0.bilibili.request(AccountAction::SignOut);
}

#[tauri::command]
fn bilibili_check(accounts: State<Accounts>) {
    accounts.0.bilibili.request(AccountAction::Check);
}

#[tauri::command]
fn ximalaya_sign_in(accounts: State<Accounts>) {
    accounts.0.ximalaya.request(AccountAction::SignIn);
}

#[tauri::command]
fn ximalaya_sign_out(accounts: State<Accounts>) {
    accounts.0.ximalaya.request(AccountAction::SignOut);
}

#[tauri::command]
fn ximalaya_check(accounts: State<Accounts>) {
    accounts.0.ximalaya.request(AccountAction::Check);
}

#[tauri::command]
fn douyin_sign_in(accounts: State<Accounts>) {
    accounts.0.douyin.request(AccountAction::SignIn);
}

#[tauri::command]
fn douyin_sign_out(accounts: State<Accounts>) {
    accounts.0.douyin.request(AccountAction::SignOut);
}

#[tauri::command]
fn douyin_check(accounts: State<Accounts>) {
    accounts.0.douyin.request(AccountAction::Check);
}

#[tauri::command]
fn hongguo_sign_in(accounts: State<Accounts>) {
    accounts.0.hongguo.request(AccountAction::SignIn);
}

#[tauri::command]
fn hongguo_sign_out(accounts: State<Accounts>) {
    accounts.0.hongguo.request(AccountAction::SignOut);
}

#[tauri::command]
fn hongguo_check(accounts: State<Accounts>) {
    accounts.0.hongguo.request(AccountAction::Check);
}

#[tauri::command]
fn netease_sign_in(accounts: State<Accounts>) {
    accounts.0.netease.request(AccountAction::SignIn);
}

#[tauri::command]
fn netease_sign_out(accounts: State<Accounts>) {
    accounts.0.netease.request(AccountAction::SignOut);
}

#[tauri::command]
fn netease_check(accounts: State<Accounts>) {
    accounts.0.netease.request(AccountAction::Check);
}

/// Opens Apple's sign-in for Apple Music in a window on the desktop (the status then says when it's done).
#[tauri::command]
fn apple_music_sign_in(accounts: State<Accounts>) {
    accounts.0.apple_music.request(AccountAction::SignIn);
}

/// Signs Apple Music out.
#[tauri::command]
fn apple_music_sign_out(accounts: State<Accounts>) {
    accounts.0.apple_music.request(AccountAction::SignOut);
}

/// Runs Apple Music's web player (hidden), so the status says whether it's signed in.
#[tauri::command]
fn apple_music_check(accounts: State<Accounts>) {
    accounts.0.apple_music.request(AccountAction::Check);
}

/// The TruckPlay project repository page.
const SUPPORT_PAGE: &str = "https://github.com/juner122king/TruckPlay";

/// Opens the support page (Support me) in the player's browser. The address is fixed here, so the companion
/// can't open any other.
#[tauri::command]
fn open_support_page() {
    westplay_host::browser::open(SUPPORT_PAGE);
}

/// WestPlay's pages elsewhere, at the foot of the companion's list.
#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum Social {
    YouTube,
    Discord,
    Patreon,
}

/// Opens one of WestPlay's pages elsewhere (its YouTube channel, its Discord, its Patreon) in the player's browser.
/// The addresses are fixed here, as the support page's.
#[tauri::command]
fn open_social(site: Social) {
    westplay_host::browser::open(match site {
        Social::YouTube => "https://www.youtube.com/@tyraness",
        Social::Discord => "https://discord.com/invite/Jt34SmwU6",
        Social::Patreon => "https://www.patreon.com/c/westmods",
    });
}

/// Where this run's `app.log` is (the About page): Documents\WestPlay\logs, or WestPlay's own data folder where
/// Documents refused it; `None` if it couldn't be made.
#[tauri::command]
fn app_log_place() -> Option<String> {
    westplay_host::log::place().map(|path| path.display().to_string())
}

/// A keyboard key's name for the player's keyboard, by its virtual-key code (the keybinds' labels); `None`
/// for a mouse button or a key without one.
#[tauri::command]
fn key_name(key: u32) -> Option<String> {
    westplay_host::settings::KeyCode::name(key)
}

#[tauri::command]
fn get_settings(store: State<SettingsStore>) -> Settings {
    store.shared.get()
}

fn tray_is_zh(settings: &Settings) -> bool {
    settings
        .language
        .as_ref()
        .map(|code| code.as_str().to_owned())
        .or_else(setup::onboarding_language)
        .is_some_and(|code| code.starts_with("zh_"))
}

fn build_tray_menu(app: &AppHandle, zh: bool) -> tauri::Result<Menu<tauri::Wry>> {
    let open =
        MenuItem::with_id(app, "open", if zh { "打开 TruckPlay" } else { "Open TruckPlay" }, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", if zh { "退出" } else { "Quit" }, true, None::<&str>)?;
    Menu::with_items(app, &[&open, &quit])
}

/// Saves new settings and applies them. Values are corrected on the way in (see `westplay_host::settings`);
/// the settings as saved are returned and announced to every window (`settings-changed`).
#[tauri::command]
fn update_settings(
    settings: Settings,
    store: State<SettingsStore>,
    lifecycle: State<WindowLifecycle>,
    app: AppHandle,
) -> Result<Settings, String> {
    store.file.save(&settings).map_err(|e| format!("Couldn't save the settings: {e}"))?;
    store.shared.set(settings.clone());
    lifecycle.keep_in_tray.store(settings.window.keep_in_tray, Ordering::Release);
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_visible(settings.window.keep_in_tray);
        if let Ok(menu) = build_tray_menu(&app, tray_is_zh(&settings)) {
            let _ = tray.set_menu(Some(menu));
        }
    }
    let _ = app.emit("settings-changed", &settings);
    Ok(settings)
}

fn main() {
    // Started as administrator only to copy the plugin into the game (setup asked for it): that, and done.
    let args: Vec<String> = std::env::args().collect();
    if let Some(code) = westplay_setup::plugin::run_as_administrator_copy(&args) {
        std::process::exit(code);
    }
    // One WestPlay at a time: a second brings the running window up (or falls back to the message box if no
    // companion wake event exists). Before the log starts: a second making the log anew would empty ours.
    let Some(_instance) = westplay_host::Instance::claim() else {
        if !westplay_host::wake_running_instance() {
            westplay_host::tell_already_running();
        }
        return;
    };
    let wake_signal = westplay_host::WakeSignal::create();
    westplay_host::log::init();
    westplay_host::startup::mark("app: started");
    let open_request = Arc::new(OpenRequest::default());
    let accounts = Arc::new(AccountRequests::default());
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(update::Updates::default())
        .manage(WestplayOpen(open_request.clone()))
        .manage(Accounts(accounts.clone()))
        .register_asynchronous_uri_scheme_protocol(maps::SCHEME, maps::serve)
        .register_asynchronous_uri_scheme_protocol(maps::CUSTOMIZE_SCHEME, maps::serve_customize)
        .invoke_handler(tauri::generate_handler![
            companion_ready,
            window_in_front,
            window_minimize,
            window_close,
            window_start_dragging,
            room_held,
            set_westplay_open,
            youtube_sign_in,
            youtube_sign_out,
            youtube_check,
            bilibili_sign_in,
            bilibili_sign_out,
            bilibili_check,
            ximalaya_sign_in,
            ximalaya_sign_out,
            ximalaya_check,
            douyin_sign_in,
            douyin_sign_out,
            douyin_check,
            hongguo_sign_in,
            hongguo_sign_out,
            hongguo_check,
            netease_sign_in,
            netease_sign_out,
            netease_check,
            apple_music_sign_in,
            apple_music_sign_out,
            apple_music_check,
            open_support_page,
            open_social,
            app_log_place,
            customize::customize_list,
            customize::add_wallpapers,
            customize::add_icon_set,
            customize::remove_wallpaper,
            customize::remove_icon_set,
            update::online_updates_enabled,
            update::update_offer,
            update::look_for_update,
            update::install_update,
            get_settings,
            update_settings,
            key_name,
            setup::setup_state,
            setup::game_running,
            setup::prepare_maps_again,
            setup::prepare_maps,
            setup::cancel_map_preparation,
            setup::choose_game_folder,
            setup::check_game,
            setup::install_into_game,
            setup::finish_setup,
            setup::uninstall_from_game,
            setup::remove_data,
            setup::leave_pc
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let hide = window
                    .app_handle()
                    .try_state::<WindowLifecycle>()
                    .is_some_and(|l| l.keep_in_tray.load(Ordering::Acquire) && !l.quitting.load(Ordering::Acquire));
                if hide {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(move |app| {
            westplay_host::startup::mark("app: window set up");
            let config_dir = app.path().app_config_dir()?;
            let file = SettingsFile::in_dir(&config_dir);
            let initial_settings = file.load();
            let shared = Arc::new(SharedSettings::new(initial_settings.clone()));
            let keep_in_tray = Arc::new(AtomicBool::new(initial_settings.window.keep_in_tray));
            let quitting = Arc::new(AtomicBool::new(false));

            if let Some(window) = app.get_webview_window("main")
                && let Ok(hwnd) = window.hwnd()
            {
                westplay_host::companion_window::attach(hwnd.0 as isize, keep_in_tray.clone());
            }

            let menu = build_tray_menu(app.handle(), tray_is_zh(&initial_settings))?;
            let quit_flag = quitting.clone();
            let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
                .tooltip("TruckPlay")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "quit" => {
                        quit_flag.store(true, Ordering::Release);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }
                            | TrayIconEvent::DoubleClick { button: MouseButton::Left, .. }
                    ) {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }
            let tray = tray_builder.build(app)?;
            let _ = tray.set_visible(initial_settings.window.keep_in_tray);

            app.manage(WindowLifecycle {
                keep_in_tray,
                quitting,
                startup_handled: AtomicBool::new(false),
                woken_early: AtomicBool::new(false),
                start_minimized: initial_settings.window.start_minimized,
            });

            // A page that never says it's ready (it failed to load) still applies initial visibility.
            let fallback_app = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(SHOW_ANYWAY);
                let app_handle = fallback_app.clone();
                let _ = fallback_app.run_on_main_thread(move || apply_initial_visibility(&app_handle, true));
            });

            if let Some(wake_signal) = wake_signal {
                let wake_app = app.handle().clone();
                let _ = std::thread::Builder::new().name("westplay-wakeup".into()).spawn(move || {
                    while wake_signal.wait() {
                        show_main_window(&wake_app);
                    }
                });
            }

            let setup = SetupStore::load(&config_dir, app.handle());
            setup::watch_installed_mods(&setup);
            let customize = customize::Customize {
                dir: app.path().app_local_data_dir()?.join(westplay_host::customize::FOLDER),
                changed: Arc::default(),
            };
            let host = start_host(
                app.handle(),
                open_request.clone(),
                accounts.clone(),
                shared.clone(),
                setup.game(),
                Looks { config_dir: config_dir.clone(), customize_changed: customize.changed.clone() },
            )?;
            app.manage(customize);
            app.manage(SettingsStore { file, shared });
            app.manage(setup);
            app.manage(std::sync::Mutex::new(host));
            update::watch(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the WestPlay app");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            stop_host(app);
        }
    });
}

/// Stops the host, so its WebView2 shuts down cleanly with the app (it quitting, or an update's installer
/// about to replace it). Once: a stopped host has nothing left to stop.
fn stop_host(app: &AppHandle) {
    if let Some(host) = app.try_state::<std::sync::Mutex<Host>>() {
        let mut host = host.lock().unwrap_or_else(|e| e.into_inner());
        host.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = host.thread.take() {
            let _ = thread.join();
        }
    }
}

/// What the host needs for the screen's look: where the settings are kept (the cab changes its wallpaper
/// itself), and the count of changes to the player's wallpapers and icon sets.
struct Looks {
    config_dir: PathBuf,
    customize_changed: Arc<std::sync::atomic::AtomicU64>,
}

/// How a run of the host ended.
enum Ended {
    Stopped,
    BrowserGone,
    /// To draw the cab on another GPU (westplay_host::graphics).
    GpuChanged,
    Failed(String),
}

/// The host is started again after its browser fails at most this often within the window, after a pause.
const MAX_RESTARTS: usize = 5;
const RESTART_WINDOW: Duration = Duration::from_secs(60);
const RESTART_DELAY: Duration = Duration::from_secs(1);
/// How long WebView2's browsers are waited for to go before the host starts on another GPU.
const BROWSERS_GOING: Duration = Duration::from_secs(10);

fn start_host(
    app: &AppHandle,
    open_request: Arc<OpenRequest>,
    accounts: Arc<AccountRequests>,
    settings: Arc<SharedSettings>,
    game: Arc<SetUpGame>,
    looks: Looks,
) -> Result<Host, Box<dyn std::error::Error>> {
    let content = cabin_content(app);
    let data_dir = app.path().app_local_data_dir()?;
    let map_builder = setup::map_builder_file(app);
    westplay_host::log!(
        "maps: {}",
        map_builder
            .as_ref()
            .map_or("no map builder: built in WestPlay itself".into(), |file| format!("built by {}", file.display()))
    );
    let stop = Arc::new(AtomicBool::new(false));

    let events = app.clone();
    let thread_stop = stop.clone();
    // The host runs on a thread of its own, started again (on a new thread) if WebView2's browser process
    // exits under it (westplay_host::BrowserGone): the cabin page comes back rather than staying blank. Not
    // endlessly: a browser failing again and again is reported instead.
    let thread = std::thread::Builder::new().name("westplay-host-supervisor".into()).spawn(move || {
        let mut restarts: Vec<Instant> = Vec::new();
        loop {
            let (content, data_dir) = (content.clone(), data_dir.clone());
            let (open_request, settings, stop) = (open_request.clone(), settings.clone(), thread_stop.clone());
            let (accounts, game, map_builder) = (accounts.clone(), game.clone(), map_builder.clone());
            let status_events = events.clone();
            let (settings_events, settings_dir) = (events.clone(), looks.config_dir.clone());
            let customize_changed = looks.customize_changed.clone();
            let run = std::thread::Builder::new().name("westplay-host".into()).spawn(move || {
                let config = Config {
                    width: SCREEN_WIDTH,
                    height: SCREEN_HEIGHT,
                    content,
                    data_dir,
                    open_request,
                    accounts,
                    settings,
                    game,
                    map_builder,
                    on_status: Box::new(move |status| {
                        let _ = status_events.emit("host-status", status);
                    }),
                    // The cab's own Settings changed one (its wallpaper): kept, and the companion told.
                    on_settings: Box::new(move |settings| {
                        if let Err(error) = SettingsFile::in_dir(&settings_dir).save(settings) {
                            westplay_host::log!("[settings] couldn't save the cab's change: {error}");
                        }
                        let _ = settings_events.emit("settings-changed", settings);
                    }),
                    customize_changed,
                };
                match westplay_host::run(config, stop) {
                    Ok(()) => Ended::Stopped,
                    Err(e) if e.is::<BrowserGone>() => Ended::BrowserGone,
                    Err(e) if e.is::<westplay_host::graphics::GpuChanged>() => Ended::GpuChanged,
                    Err(e) => Ended::Failed(e.to_string()),
                }
            });
            let ended = match run.map(|thread| thread.join()) {
                Ok(Ok(ended)) => ended,
                Ok(Err(_)) => Ended::Failed("it crashed".into()),
                Err(e) => Ended::Failed(e.to_string()),
            };
            let error = match ended {
                Ended::Stopped => return,
                Ended::BrowserGone | Ended::GpuChanged if thread_stop.load(Ordering::Relaxed) => return,
                // Started again on the other GPU once the browsers have gone (one still running would refuse
                // the new arguments). Not counted as a failure.
                Ended::GpuChanged => {
                    westplay_host::wait_for_browsers(BROWSERS_GOING);
                    continue;
                }
                Ended::BrowserGone => {
                    let now = Instant::now();
                    restarts.retain(|&at| now.duration_since(at) < RESTART_WINDOW);
                    restarts.push(now);
                    if restarts.len() <= MAX_RESTARTS {
                        std::thread::sleep(RESTART_DELAY);
                        continue;
                    }
                    BrowserGone.to_string()
                }
                Ended::Failed(error) => error,
            };
            // In the log too: shown only, a player's said nothing of it (2026-11-11).
            westplay_host::log!("WestPlay engine stopped: {error}");
            let status = Status { error: Some(format!("WestPlay engine stopped: {error}")), ..Default::default() };
            let _ = events.emit("host-status", &status);
            return;
        }
    })?;
    Ok(Host { stop, thread: Some(thread) })
}

/// The cabin page: from the Vite dev server while developing, from the bundled UI otherwise.
fn cabin_content(app: &AppHandle) -> Content {
    if cfg!(debug_assertions)
        && let Some(dev_url) = &app.config().build.dev_url
    {
        return Content::Url(format!("{}cabin.html", dev_url.as_str()));
    }
    let bundled =
        app.path().resource_dir().map(|dir| dir.join("ui")).ok().filter(|dir| dir.join("cabin.html").exists());
    // Unbundled release builds (`cargo build --release`) use the UI build next to the sources.
    let root = bundled.unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ui/dist"));
    Content::Folder { root, page: "cabin.html".into() }
}
