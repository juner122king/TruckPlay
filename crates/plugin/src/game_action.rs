//! Synthetic in-game key sequences triggered by the Phone app through [`westplay_shared::GameActionBlock`].
//!
//! Runs as a non-blocking state machine stepped once per rendered frame (`on_frame`, from `d3d::on_present`),
//! so sequences keep advancing even when opening an in-game modal (such as F7 Assistance) pauses simulation.
//! Synthetic keys are injected through both Win32 messages (`PostMessageW` + `GetAsyncKeyState`/`GetKeyState`
//! hooks) and DirectInput keyboard hooks (`input.rs`), so both `sys.keyboard` and `di8.keyboard` profiles work.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicU32, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use westplay_shared::{
    DEFAULT_INTERACTION_KEY, GAME_ACTION_FLAG_AUTO_CONFIRM, GAME_ACTION_KEY_COUNT, GameAction, GameActionAnswer,
};
use windows::Win32::Foundation::{LPARAM, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{MAPVK_VK_TO_VSC_EX, MapVirtualKeyW};
use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_KEYDOWN, WM_KEYUP};

use crate::{bridge, d3d, input, log, telemetry};

/// Default Windows virtual-key codes when `controls.sii` didn't override them.
const VK_DEFAULT_F7: u32 = 0x76;
const VK_DEFAULT_ENTER: u32 = 0x0D;
const VK_DEFAULT_F: u32 = 0x46;
const VK_DEFAULT_G: u32 = 0x47;
const VK_DEFAULT_ESC: u32 = 0x1B;

const VK_KEY_1: u32 = 0x31;
const VK_KEY_2: u32 = 0x32;
const VK_KEY_3: u32 = 0x33;

/// Initial quiet window after cancelling screen interaction so the game sees modifier keys released first.
const SETTLE_GAP_MS: u64 = 45;
const KEY_HOLD_MS: u64 = 55;
const DIALOG_GAP_MS: u64 = 200;
const CONFIRM_GAP_MS: u64 = 160;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct KeyStep {
    vk: u32,
    hold_ms: u64,
    gap_after_ms: u64,
}

#[derive(Debug, Default)]
enum RunnerState {
    #[default]
    Idle,
    /// Waiting before pressing step `index`.
    WaitingGap { steps: Vec<KeyStep>, index: usize, until: Instant },
    /// Holding step `index` down until `until`.
    Holding { steps: Vec<KeyStep>, index: usize, vk: u32, dik: u8, until: Instant },
}

#[derive(Default)]
struct Runner {
    state: RunnerState,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Transition {
    None,
    KeyDown { vk: u32, dik: u8 },
    KeyUp { vk: u32, dik: u8 },
    Finished,
}

impl Runner {
    fn is_busy(&self) -> bool {
        !matches!(self.state, RunnerState::Idle)
    }

    fn start(&mut self, steps: Vec<KeyStep>, now: Instant) -> bool {
        if self.is_busy() || steps.is_empty() {
            return false;
        }
        self.state = RunnerState::WaitingGap { steps, index: 0, until: now + Duration::from_millis(SETTLE_GAP_MS) };
        true
    }

    fn tick(&mut self, now: Instant, vk_to_dik: impl Fn(u32) -> u8) -> Transition {
        let state = std::mem::take(&mut self.state);
        match state {
            RunnerState::Idle => {
                self.state = RunnerState::Idle;
                Transition::None
            }
            RunnerState::WaitingGap { steps, index, until } => {
                if now < until {
                    self.state = RunnerState::WaitingGap { steps, index, until };
                    return Transition::None;
                }
                let Some(step) = steps.get(index).copied() else {
                    self.state = RunnerState::Idle;
                    return Transition::Finished;
                };
                let dik = vk_to_dik(step.vk);
                self.state = RunnerState::Holding {
                    steps,
                    index,
                    vk: step.vk,
                    dik,
                    until: now + Duration::from_millis(step.hold_ms),
                };
                Transition::KeyDown { vk: step.vk, dik }
            }
            RunnerState::Holding { steps, index, vk, dik, until } => {
                if now < until {
                    self.state = RunnerState::Holding { steps, index, vk, dik, until };
                    return Transition::None;
                }
                let next_index = index + 1;
                if next_index < steps.len() {
                    let gap = steps[index].gap_after_ms;
                    self.state =
                        RunnerState::WaitingGap { steps, index: next_index, until: now + Duration::from_millis(gap) };
                } else {
                    self.state = RunnerState::Idle;
                }
                Transition::KeyUp { vk, dik }
            }
        }
    }
}

static RUNNER: LazyLock<Mutex<Runner>> = LazyLock::new(|| Mutex::new(Runner::default()));
static ACTIVE: AtomicBool = AtomicBool::new(false);
static SYNTHETIC_VK: AtomicU32 = AtomicU32::new(0);
static SYNTHETIC_DIK: AtomicU8 = AtomicU8::new(0);
static PENDING_DIK: LazyLock<Mutex<VecDeque<(u8, bool)>>> = LazyLock::new(|| Mutex::new(VecDeque::new()));
static DIK_SEQ: AtomicU32 = AtomicU32::new(1);

/// Called once per rendered frame from `d3d::on_present`. Accepts new bridge requests and advances any active
/// synthetic key sequence.
pub fn on_frame() {
    let now = Instant::now();
    poll_bridge(now);
    advance(now);
}

fn poll_bridge(now: Instant) {
    let Some(bridge) = bridge::get() else { return };
    let block = &bridge.game_action;
    let request = block.request.load(Ordering::Acquire);
    if request == block.answered.load(Ordering::Relaxed) {
        return;
    }

    let action = GameAction::from_code(block.action.load(Ordering::Acquire));
    let flags = block.flags.load(Ordering::Acquire);
    let mut keys = [0u32; GAME_ACTION_KEY_COUNT];
    for (slot, atom) in keys.iter_mut().zip(&block.key_vks) {
        *slot = atom.load(Ordering::Acquire);
    }

    let answer = match action {
        None => GameActionAnswer::Unsupported,
        Some(action) => {
            if !d3d::game_shown() || d3d::game_hwnd().is_none() {
                GameActionAnswer::NotInGame
            } else if requires_unpaused(action) && telemetry::paused() {
                GameActionAnswer::GamePaused
            } else {
                let steps = build_steps(action, flags, &keys);
                let mut runner = RUNNER.lock().unwrap_or_else(|e| e.into_inner());
                if runner.start(steps, now) {
                    ACTIVE.store(true, Ordering::Release);
                    input::cancel_toggle();
                    GameActionAnswer::Done
                } else {
                    GameActionAnswer::Busy
                }
            }
        }
    };

    log!("game_action: {action:?} (flags={flags:#x}) -> {answer:?}");
    block.answer.store(answer as i32, Ordering::Relaxed);
    block.answered.store(request, Ordering::Release);
}

fn advance(now: Instant) {
    let (transition, still_active) = {
        let mut runner = RUNNER.lock().unwrap_or_else(|e| e.into_inner());
        let transition = runner.tick(now, vk_to_dik);
        (transition, runner.is_busy())
    };
    match transition {
        Transition::None => {}
        Transition::KeyDown { vk, dik } => {
            SYNTHETIC_VK.store(vk, Ordering::Release);
            SYNTHETIC_DIK.store(dik, Ordering::Release);
            if dik != 0 {
                PENDING_DIK.lock().unwrap_or_else(|e| e.into_inner()).push_back((dik, true));
            }
            post_key(vk, true);
        }
        Transition::KeyUp { vk, dik } => {
            SYNTHETIC_VK.store(0, Ordering::Release);
            SYNTHETIC_DIK.store(0, Ordering::Release);
            if dik != 0 {
                PENDING_DIK.lock().unwrap_or_else(|e| e.into_inner()).push_back((dik, false));
            }
            post_key(vk, false);
        }
        Transition::Finished => {
            SYNTHETIC_VK.store(0, Ordering::Release);
            SYNTHETIC_DIK.store(0, Ordering::Release);
        }
    }
    ACTIVE.store(still_active, Ordering::Release);
}

fn requires_unpaused(action: GameAction) -> bool {
    matches!(
        action,
        GameAction::RoadsideTowToService
            | GameAction::RoadsideTowToRoad
            | GameAction::RoadsideEmergencyRefuel
            | GameAction::OpenAssistanceMenu
            | GameAction::ToggleHazardLights
    )
}

fn key_or(keys: &[u32; GAME_ACTION_KEY_COUNT], index: usize, default_vk: u32) -> u32 {
    let vk = keys[index];
    if vk != 0 && vk <= 0xFE { vk } else { default_vk }
}

fn build_steps(action: GameAction, flags: u32, keys: &[u32; GAME_ACTION_KEY_COUNT]) -> Vec<KeyStep> {
    let f7 = key_or(keys, 0, VK_DEFAULT_F7);
    let enter = key_or(keys, 1, VK_DEFAULT_ENTER);
    let hazard = key_or(keys, 2, VK_DEFAULT_F);
    let garage = key_or(keys, 3, VK_DEFAULT_G);
    let esc = key_or(keys, 4, VK_DEFAULT_ESC);
    let auto_confirm = flags & GAME_ACTION_FLAG_AUTO_CONFIRM != 0;

    let tap = |vk: u32, gap_after_ms: u64| KeyStep { vk, hold_ms: KEY_HOLD_MS, gap_after_ms };
    match action {
        GameAction::RoadsideTowToService | GameAction::RoadsideTowToRoad | GameAction::RoadsideEmergencyRefuel => {
            let option_vk = match action {
                GameAction::RoadsideTowToService => VK_KEY_1,
                GameAction::RoadsideTowToRoad => VK_KEY_2,
                GameAction::RoadsideEmergencyRefuel => VK_KEY_3,
                _ => unreachable!(),
            };
            let mut steps = vec![tap(f7, DIALOG_GAP_MS), tap(enter, DIALOG_GAP_MS), tap(option_vk, CONFIRM_GAP_MS)];
            if auto_confirm {
                steps.push(tap(enter, 0));
            }
            steps
        }
        GameAction::OpenAssistanceMenu => vec![tap(f7, DIALOG_GAP_MS), tap(enter, 0)],
        GameAction::ToggleHazardLights => vec![tap(hazard, 0)],
        GameAction::OpenGarageManager => vec![tap(garage, 0)],
        GameAction::OpenGameDesktop => vec![tap(esc, 0)],
    }
}

/// Whether a synthetic sequence is currently active (used to temporarily mask the interaction modifier key).
pub fn is_active() -> bool {
    ACTIVE.load(Ordering::Acquire)
}

/// Whether `vk` is currently held down synthetically (for `GetAsyncKeyState`/`GetKeyState` hooks).
pub fn synthetic_vk_down(vk: u32) -> bool {
    let current = SYNTHETIC_VK.load(Ordering::Acquire);
    current != 0 && current == vk
}

/// Whether `vk` is the interaction key that should be hidden while a synthetic sequence runs.
pub fn hides_vk(vk: u32) -> bool {
    if !is_active() {
        return false;
    }
    let interaction = interaction_vk();
    vk == interaction || matches!((interaction, vk), (0xA4 | 0xA5, 0x12) | (0xA0 | 0xA1, 0x10) | (0xA2 | 0xA3, 0x11))
}

/// Whether a DirectInput keyboard `dik` scan code should be hidden while a synthetic sequence runs.
pub fn hides_dik(dik: u32) -> bool {
    if !is_active() {
        return false;
    }
    let interaction_dik = u32::from(vk_to_dik(interaction_vk()));
    interaction_dik != 0 && dik == interaction_dik
}

/// Applies the currently held synthetic key to a 256-byte DirectInput keyboard state array.
pub fn apply_dinput_state(state: &mut [u8]) {
    let dik = SYNTHETIC_DIK.load(Ordering::Acquire) as usize;
    if dik != 0 && dik < state.len() {
        state[dik] = 0x80;
    }
}

/// Drains up to `max_events` queued DirectInput keyboard events `(dik, down, seq)`.
pub fn drain_dinput_events(max_events: usize) -> Vec<(u8, bool, u32)> {
    if max_events == 0 {
        return Vec::new();
    }
    let mut queue = PENDING_DIK.lock().unwrap_or_else(|e| e.into_inner());
    let mut out = Vec::new();
    while out.len() < max_events {
        let Some((dik, down)) = queue.pop_front() else { break };
        let seq = DIK_SEQ.fetch_add(1, Ordering::Relaxed);
        out.push((dik, down, seq));
    }
    out
}

fn interaction_vk() -> u32 {
    match bridge::get().map(|b| b.host.interaction_key.load(Ordering::Acquire)) {
        Some(key) if key != 0 => key,
        _ => DEFAULT_INTERACTION_KEY,
    }
}

fn vk_to_dik(vk: u32) -> u8 {
    // SAFETY: plain lookup, no pointers.
    let sc = unsafe { MapVirtualKeyW(vk, MAPVK_VK_TO_VSC_EX) };
    if sc == 0 {
        return 0;
    }
    let extended = ((sc >> 8) & 0xFF) == 0xE0;
    ((sc & 0x7F) as u8) | if extended { 0x80 } else { 0 }
}

fn post_key(vk: u32, down: bool) {
    let Some(hwnd) = d3d::game_hwnd() else { return };
    // SAFETY: plain lookup, no pointers.
    let sc = unsafe { MapVirtualKeyW(vk, MAPVK_VK_TO_VSC_EX) };
    let scan = (sc & 0xFF) as isize;
    let extended = if ((sc >> 8) & 0xFF) == 0xE0 { 1isize << 24 } else { 0 };
    let (msg, lparam) = if down {
        (WM_KEYDOWN, LPARAM(1 | (scan << 16) | extended))
    } else {
        (WM_KEYUP, LPARAM(1 | (scan << 16) | extended | (1 << 30) | (1 << 31)))
    };
    // SAFETY: `hwnd` is the game's window handle; `PostMessageW` is thread-safe and rejects stale handles.
    let _ = unsafe { PostMessageW(Some(hwnd), msg, WPARAM(vk as usize), lparam) };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_expected_key_sequences_for_roadside_and_ui_actions() {
        let defaults = [0u32; GAME_ACTION_KEY_COUNT];
        let tow = build_steps(GameAction::RoadsideTowToService, 0, &defaults);
        assert_eq!(tow.iter().map(|s| s.vk).collect::<Vec<_>>(), [VK_DEFAULT_F7, VK_DEFAULT_ENTER, VK_KEY_1]);

        let tow_auto = build_steps(GameAction::RoadsideTowToService, GAME_ACTION_FLAG_AUTO_CONFIRM, &defaults);
        assert_eq!(
            tow_auto.iter().map(|s| s.vk).collect::<Vec<_>>(),
            [VK_DEFAULT_F7, VK_DEFAULT_ENTER, VK_KEY_1, VK_DEFAULT_ENTER]
        );

        let road = build_steps(GameAction::RoadsideTowToRoad, 0, &defaults);
        assert_eq!(road.iter().map(|s| s.vk).collect::<Vec<_>>(), [VK_DEFAULT_F7, VK_DEFAULT_ENTER, VK_KEY_2]);

        let refuel = build_steps(GameAction::RoadsideEmergencyRefuel, 0, &defaults);
        assert_eq!(refuel.iter().map(|s| s.vk).collect::<Vec<_>>(), [VK_DEFAULT_F7, VK_DEFAULT_ENTER, VK_KEY_3]);

        // Respects custom profile bindings from controls.sii.
        let custom = [0x77, 0x20, 0x48, 0x4B, 0x1B];
        let hazard = build_steps(GameAction::ToggleHazardLights, 0, &custom);
        assert_eq!(hazard.iter().map(|s| s.vk).collect::<Vec<_>>(), [0x48]);
        let garage = build_steps(GameAction::OpenGarageManager, 0, &custom);
        assert_eq!(garage.iter().map(|s| s.vk).collect::<Vec<_>>(), [0x4B]);
        let menu = build_steps(GameAction::OpenAssistanceMenu, 0, &custom);
        assert_eq!(menu.iter().map(|s| s.vk).collect::<Vec<_>>(), [0x77, 0x20]);
    }

    #[test]
    fn runner_steps_through_settle_hold_gap_and_prevents_overlap() {
        let mut runner = Runner::default();
        let t0 = Instant::now();
        let steps = vec![
            KeyStep { vk: VK_DEFAULT_F7, hold_ms: 50, gap_after_ms: 100 },
            KeyStep { vk: VK_DEFAULT_ENTER, hold_ms: 50, gap_after_ms: 0 },
        ];
        assert!(runner.start(steps.clone(), t0));
        assert!(!runner.start(steps, t0), "busy runner rejects overlapping request");

        // Before settle gap ends: no key yet.
        assert_eq!(runner.tick(t0 + Duration::from_millis(10), |_| 0x41), Transition::None);
        // After settle gap: presses F7.
        assert_eq!(
            runner.tick(t0 + Duration::from_millis(SETTLE_GAP_MS), |_| 0x41),
            Transition::KeyDown { vk: VK_DEFAULT_F7, dik: 0x41 }
        );
        // Mid-hold: still holding.
        assert_eq!(runner.tick(t0 + Duration::from_millis(SETTLE_GAP_MS + 20), |_| 0x41), Transition::None);
        // End of hold: releases F7.
        assert_eq!(
            runner.tick(t0 + Duration::from_millis(SETTLE_GAP_MS + 50), |_| 0x41),
            Transition::KeyUp { vk: VK_DEFAULT_F7, dik: 0x41 }
        );
        // After gap: presses Enter.
        let t_enter = t0 + Duration::from_millis(SETTLE_GAP_MS + 50 + 100);
        assert_eq!(runner.tick(t_enter, |_| 0x1C), Transition::KeyDown { vk: VK_DEFAULT_ENTER, dik: 0x1C });
        // End of Enter hold: releases and returns to idle.
        assert_eq!(
            runner.tick(t_enter + Duration::from_millis(50), |_| 0x1C),
            Transition::KeyUp { vk: VK_DEFAULT_ENTER, dik: 0x1C }
        );
        assert!(!runner.is_busy());
    }
}
