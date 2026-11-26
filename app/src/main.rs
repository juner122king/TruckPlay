//! WestPlay app: the companion window (Tauri) plus the in-cabin UI host on its own thread.

// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod customize;
mod maps;
mod setup;
mod update;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use setup::SetupStore;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use westplay_host::maps::SetUpGame;
use westplay_host::settings::{Settings, SettingsFile, SharedSettings};
use westplay_host::{
    AccountAction, AccountRequests, BrowserGone, Config, Content, OpenRequest, SCREEN_HEIGHT, SCREEN_WIDTH, Status,
};

const TRAY_ID: &str = "main-tray";
const MAIN_WINDOW_LABEL: &str = "main";

struct Host {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PendingShow {
    /// Initial launch with `start_minimized = true` and `keep_in_tray = false`: show minimized on taskbar.
    StartMinimized,
    /// Normal launch or reopen from tray: show and focus once `companion_ready` fires (or after `SHOW_ANYWAY`).
    ShowAndFocus,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct SavedBounds {
    /// Last non-minimized, non-maximized logical `(x, y, width, height)`.
    normal: Option<(f64, f64, f64, f64)>,
    maximized: bool,
}

/// Companion window lifecycle: tray persistence (destroying the WebView2 window when sent to tray and
/// recreating it on demand), saved geometry across recreations, and single-instance wakeup state.
struct WindowLifecycle {
    keep_in_tray: Arc<AtomicBool>,
    quitting: Arc<AtomicBool>,
    closing: AtomicBool,
    reopen_after_destroy: AtomicBool,
    window_generation: AtomicU64,
    shown_generation: AtomicU64,
    pending_show: Mutex<PendingShow>,
    saved_bounds: Mutex<SavedBounds>,
}

impl WindowLifecycle {
    fn new(keep_in_tray: Arc<AtomicBool>, quitting: Arc<AtomicBool>) -> Self {
        Self {
            keep_in_tray,
            quitting,
            closing: AtomicBool::new(false),
            reopen_after_destroy: AtomicBool::new(false),
            window_generation: AtomicU64::new(0),
            shown_generation: AtomicU64::new(0),
            pending_show: Mutex::new(PendingShow::ShowAndFocus),
            saved_bounds: Mutex::new(SavedBounds::default()),
        }
    }

    fn stay_in_tray_on_exit(&self, code: Option<i32>) -> bool {
        code.is_none() && self.keep_in_tray.load(Ordering::Acquire) && !self.quitting.load(Ordering::Acquire)
    }
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

/// The companion's page has drawn its first screen: reveal the current companion window once.
#[tauri::command]
fn companion_ready(app: AppHandle) {
    reveal_main_window(&app, None, false);
}

fn emit_cached_status(app: &AppHandle) {
    if let Some(cached) = app.try_state::<CachedStatus>()
        && let Some(status) = cached.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
    {
        let _ = app.emit("host-status", &status);
    }
}

fn save_window_bounds(window: &WebviewWindow, lifecycle: &WindowLifecycle) {
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let maximized = window.is_maximized().unwrap_or(false);
    let mut saved = lifecycle.saved_bounds.lock().unwrap_or_else(|e| e.into_inner());
    if maximized {
        saved.maximized = true;
        return;
    }
    let scale = window.scale_factor().unwrap_or(1.0).max(0.5);
    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) {
        let pos = pos.to_logical::<f64>(scale);
        let size = size.to_logical::<f64>(scale);
        if size.width >= 320.0 && size.height >= 240.0 && pos.x > -16_000.0 && pos.y > -16_000.0 {
            saved.normal = Some((pos.x, pos.y, size.width, size.height));
            saved.maximized = false;
        }
    }
}

/// Creates the companion window from `tauri.conf.json` (hidden until `companion_ready`), attaches its
/// native rounded frame/shadow, and starts the fallback reveal timer. Must be called on the main thread.
fn create_main_window(app: &AppHandle, pending: PendingShow) -> tauri::Result<()> {
    if app.get_webview_window(MAIN_WINDOW_LABEL).is_some() {
        return Ok(());
    }
    let Some(lifecycle) = app.try_state::<WindowLifecycle>() else {
        return Ok(());
    };
    let Some(config) = app.config().app.windows.iter().find(|w| w.label == MAIN_WINDOW_LABEL).cloned() else {
        return Err(tauri::Error::AssetNotFound(format!("window config `{MAIN_WINDOW_LABEL}`")));
    };

    let generation = lifecycle.window_generation.fetch_add(1, Ordering::AcqRel) + 1;
    *lifecycle.pending_show.lock().unwrap_or_else(|e| e.into_inner()) = pending;
    let saved = *lifecycle.saved_bounds.lock().unwrap_or_else(|e| e.into_inner());

    let mut builder = WebviewWindowBuilder::from_config(app, &config)?.visible(false);
    if let Some((x, y, width, height)) = saved.normal {
        builder = builder.position(x, y).inner_size(width, height);
    }
    if saved.maximized {
        builder = builder.maximized(true);
    }

    let window = builder.build()?;
    if let Ok(hwnd) = window.hwnd() {
        westplay_host::companion_window::attach(hwnd.0 as isize, lifecycle.keep_in_tray.clone());
    }

    if generation == 1 {
        westplay_host::startup::mark("app: window set up");
    } else {
        westplay_host::log!("companion: recreated window from tray");
    }

    // A page that never says it's ready (it failed to load) still applies visibility.
    let fallback_app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(SHOW_ANYWAY);
        let app_handle = fallback_app.clone();
        let _ = fallback_app.run_on_main_thread(move || reveal_main_window(&app_handle, Some(generation), true));
    });
    Ok(())
}

fn reveal_main_window(app: &AppHandle, generation: Option<u64>, fallback: bool) {
    let Some(lifecycle) = app.try_state::<WindowLifecycle>() else {
        return;
    };
    let current = lifecycle.window_generation.load(Ordering::Acquire);
    let target = generation.unwrap_or(current);
    if target == 0 || target != current {
        return;
    }
    if lifecycle.shown_generation.fetch_max(target, Ordering::AcqRel) >= target {
        return;
    }
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    let pending = *lifecycle.pending_show.lock().unwrap_or_else(|e| e.into_inner());
    if pending == PendingShow::StartMinimized {
        westplay_host::startup::mark("app: started minimized");
        if let Ok(hwnd) = window.hwnd() {
            westplay_host::companion_window::show_minimized_no_activate(hwnd.0 as isize);
        } else {
            let _ = window.minimize();
        }
        return;
    }
    if !window.is_visible().unwrap_or(false) {
        if target == 1 {
            westplay_host::startup::mark(if fallback {
                "app: window shown without its page ready"
            } else {
                "app: window shown"
            });
        } else if fallback {
            westplay_host::log!("companion: recreated window shown without its page ready");
        }
        let _ = window.show();
        let _ = window.set_focus();
        if let Ok(hwnd) = window.hwnd() {
            westplay_host::companion_window::force_foreground(hwnd.0 as isize);
        }
    }
    emit_cached_status(app);
}

/// Latest host status cached so hidden/destroyed tray windows do not receive 1 Hz IPC broadcasts,
/// and receive the latest snapshot immediately when restored or recreated.
struct CachedStatus(Mutex<Option<Status>>);

/// Brings the companion window up from the tray (recreating it if it was destroyed), taskbar, or background
/// and focuses it.
fn show_main_window(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(lifecycle) = handle.try_state::<WindowLifecycle>() else {
            return;
        };
        *lifecycle.pending_show.lock().unwrap_or_else(|e| e.into_inner()) = PendingShow::ShowAndFocus;
        if lifecycle.closing.load(Ordering::Acquire) {
            lifecycle.reopen_after_destroy.store(true, Ordering::Release);
            return;
        }
        if let Some(window) = handle.get_webview_window(MAIN_WINDOW_LABEL) {
            let current = lifecycle.window_generation.load(Ordering::Acquire);
            if lifecycle.shown_generation.load(Ordering::Acquire) >= current {
                if window.is_minimized().unwrap_or(false) {
                    let _ = window.unminimize();
                }
                let _ = window.show();
                let _ = window.set_focus();
                if let Ok(hwnd) = window.hwnd() {
                    westplay_host::companion_window::force_foreground(hwnd.0 as isize);
                }
                emit_cached_status(&handle);
            }
            return;
        }
        if let Err(error) = create_main_window(&handle, PendingShow::ShowAndFocus) {
            westplay_host::log!("companion: couldn't recreate window: {error}");
        }
    });
}

#[tauri::command]
fn window_minimize(window: WebviewWindow, lifecycle: State<WindowLifecycle>) {
    if lifecycle.keep_in_tray.load(Ordering::Acquire) {
        let _ = window.close();
    } else {
        let _ = window.minimize();
    }
}

#[tauri::command]
fn window_close(window: WebviewWindow) {
    let _ = window.close();
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

#[tauri::command]
fn qqmusic_sign_in(accounts: State<Accounts>) {
    accounts.0.qqmusic.request(AccountAction::SignIn);
}

#[tauri::command]
fn qqmusic_sign_out(accounts: State<Accounts>) {
    accounts.0.qqmusic.request(AccountAction::SignOut);
}

#[tauri::command]
fn qqmusic_check(accounts: State<Accounts>) {
    accounts.0.qqmusic.request(AccountAction::Check);
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
            qqmusic_sign_in,
            qqmusic_sign_out,
            qqmusic_check,
            apple_music_sign_in,
            apple_music_sign_out,
            apple_music_check,
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
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }
            match event {
                WindowEvent::CloseRequested { .. } => {
                    if let Some(lifecycle) = window.app_handle().try_state::<WindowLifecycle>() {
                        if let Some(webview) = window.app_handle().get_webview_window(MAIN_WINDOW_LABEL) {
                            save_window_bounds(&webview, &lifecycle);
                        }
                        lifecycle.closing.store(true, Ordering::Release);
                    }
                }
                WindowEvent::Destroyed => {
                    let app = window.app_handle();
                    if let Some(lifecycle) = app.try_state::<WindowLifecycle>() {
                        lifecycle.closing.store(false, Ordering::Release);
                        let reopen = lifecycle.reopen_after_destroy.swap(false, Ordering::AcqRel);
                        let quitting = lifecycle.quitting.load(Ordering::Acquire);
                        if reopen && !quitting {
                            if let Err(error) = create_main_window(app, PendingShow::ShowAndFocus) {
                                westplay_host::log!("companion: couldn't recreate window after close: {error}");
                            }
                        } else if lifecycle.keep_in_tray.load(Ordering::Acquire) && !quitting {
                            westplay_host::log!("companion: closed to system tray (WebView2 released)");
                        }
                    }
                }
                _ => {}
            }
        })
        .setup(move |app| {
            let config_dir = app.path().app_config_dir()?;
            let file = SettingsFile::in_dir(&config_dir);
            let initial_settings = file.load();
            let shared = Arc::new(SharedSettings::new(initial_settings.clone()));
            let keep_in_tray = Arc::new(AtomicBool::new(initial_settings.window.keep_in_tray));
            let quitting = Arc::new(AtomicBool::new(false));

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

            app.manage(WindowLifecycle::new(keep_in_tray, quitting));
            app.manage(CachedStatus(Mutex::new(None)));

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
            app.manage(Mutex::new(host));
            update::watch(app.handle());

            if initial_settings.window.start_minimized && initial_settings.window.keep_in_tray {
                westplay_host::startup::mark("app: started in system tray (companion window deferred)");
            } else {
                let pending = if initial_settings.window.start_minimized {
                    PendingShow::StartMinimized
                } else {
                    PendingShow::ShowAndFocus
                };
                create_main_window(app.handle(), pending)?;
            }

            if let Some(wake_signal) = wake_signal {
                let wake_app = app.handle().clone();
                let _ = std::thread::Builder::new().name("westplay-wakeup".into()).spawn(move || {
                    while wake_signal.wait() {
                        show_main_window(&wake_app);
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the WestPlay app");

    app.run(|app, event| match event {
        RunEvent::ExitRequested { api, code, .. } => {
            if app.try_state::<WindowLifecycle>().is_some_and(|l| l.stay_in_tray_on_exit(code)) {
                api.prevent_exit();
            }
        }
        RunEvent::Exit => {
            stop_host(app);
        }
        _ => {}
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
                        if let Some(cached) = status_events.try_state::<CachedStatus>() {
                            *cached.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(status.clone());
                        }
                        let should_emit = status_events.get_webview_window(MAIN_WINDOW_LABEL).is_some_and(|w| {
                            status.error.is_some()
                                || (w.is_visible().unwrap_or(true) && !w.is_minimized().unwrap_or(false))
                        });
                        if should_emit {
                            let _ = status_events.emit("host-status", status);
                        }
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
            westplay_host::log!("TruckPlay engine stopped: {error}");
            let status = Status { error: Some(format!("TruckPlay engine stopped: {error}")), ..Default::default() };
            if let Some(cached) = events.try_state::<CachedStatus>() {
                *cached.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(status.clone());
            }
            if events.get_webview_window(MAIN_WINDOW_LABEL).is_some() {
                let _ = events.emit("host-status", &status);
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_exit_policy_prevents_exit_only_when_closing_last_window_with_tray_enabled() {
        let keep = Arc::new(AtomicBool::new(true));
        let quitting = Arc::new(AtomicBool::new(false));
        let lifecycle = WindowLifecycle::new(keep.clone(), quitting.clone());

        assert!(lifecycle.stay_in_tray_on_exit(None));
        assert!(!lifecycle.stay_in_tray_on_exit(Some(0)));

        quitting.store(true, Ordering::Release);
        assert!(!lifecycle.stay_in_tray_on_exit(None));

        quitting.store(false, Ordering::Release);
        keep.store(false, Ordering::Release);
        assert!(!lifecycle.stay_in_tray_on_exit(None));
    }

    #[test]
    fn tauri_config_defers_main_window_creation_for_tray_lifecycle() {
        let raw = include_str!("../tauri.conf.json");
        let config: tauri::utils::config::Config = serde_json::from_str(raw).expect("valid tauri.conf.json");
        let main = config.app.windows.iter().find(|w| w.label == MAIN_WINDOW_LABEL).expect("main window config");
        assert!(!main.create, "main window should be created dynamically so tray-only startup skips WebView2");
        assert!(!main.visible, "main window starts hidden until companion_ready");
    }
}
