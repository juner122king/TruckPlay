//! Coordinates in-game action requests from the cabin Phone app (`GameActionBlock` in the shared bridge)
//! and parses player keybindings from the active profile's `controls.sii`.

use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use westplay_shared::{
    GAME_ACTION_FLAG_AUTO_CONFIRM, GAME_ACTION_KEY_COUNT, GameAction, GameActionAnswer, GameActionBlock,
};

/// How long the plugin has to answer an action request before the UI receives `"noAnswer"`.
const ANSWER_WITHIN: Duration = Duration::from_secs(3);

#[derive(Default)]
pub struct GameActions {
    pending: Option<Pending>,
}

struct Pending {
    request: u32,
    id: u32,
    sent: Instant,
}

impl GameActions {
    /// Sends a game action request to the plugin through the bridge. Returns a `"noAnswer"` message for an
    /// earlier request overtaken by this one, if any.
    pub fn ask(
        &mut self,
        block: &GameActionBlock,
        id: u32,
        action: GameAction,
        auto_confirm: bool,
        key_vks: &[u32; GAME_ACTION_KEY_COUNT],
        now: Instant,
    ) -> Option<String> {
        let overtaken = self.pending.take().map(|pending| answer_message(pending.id, None));
        block.action.store(action as u32, Ordering::Relaxed);
        block.flags.store(if auto_confirm { GAME_ACTION_FLAG_AUTO_CONFIRM } else { 0 }, Ordering::Relaxed);
        for (slot, &vk) in block.key_vks.iter().zip(key_vks) {
            slot.store(vk, Ordering::Relaxed);
        }
        let request = block.request.load(Ordering::Relaxed).wrapping_add(1);
        block.request.store(request, Ordering::Release);
        self.pending = Some(Pending { request, id, sent: now });
        overtaken
    }

    /// Returns the plugin's answer to the pending request once answered or timed out.
    pub fn answer(&mut self, block: &GameActionBlock, now: Instant) -> Option<String> {
        let pending = self.pending.as_ref()?;
        let message = if block.answered.load(Ordering::Acquire) == pending.request {
            answer_message(pending.id, GameActionAnswer::from_code(block.answer.load(Ordering::Relaxed)))
        } else if now.duration_since(pending.sent) >= ANSWER_WITHIN {
            answer_message(pending.id, None)
        } else {
            return None;
        };
        self.pending = None;
        Some(message)
    }
}

fn answer_message(id: u32, answer: Option<GameActionAnswer>) -> String {
    let answer = match answer {
        Some(GameActionAnswer::Done) => "done",
        Some(GameActionAnswer::GamePaused) => "gamePaused",
        Some(GameActionAnswer::NotInGame) => "notInGame",
        Some(GameActionAnswer::Busy) => "busy",
        Some(GameActionAnswer::Unsupported) => "unsupported",
        None => "noAnswer",
    };
    serde_json::json!({ "type": "gameActionAnswer", "id": id, "answer": answer }).to_string()
}

/// Parses keyboard bindings from a profile's `controls.sii` text for the 5 Phone-triggered game actions:
/// `[0] = advpage3` (F7), `[1] = activate` (Enter), `[2] = flasher4way` (F), `[3] = gar_man` (G), `[4] = menu` (Esc).
/// Missing or unrecognised entries remain `0` so the plugin falls back to the game's standard default keys.
pub fn parse_controls_keybinds(text: &str) -> [u32; GAME_ACTION_KEY_COUNT] {
    let mut out = [0u32; GAME_ACTION_KEY_COUNT];
    const ACTIONS: [&str; GAME_ACTION_KEY_COUNT] = ["advpage3", "activate", "flasher4way", "gar_man", "menu"];

    for line in text.lines() {
        let Some((_, rhs)) = line.split_once(':') else { continue };
        let inner = rhs.trim().trim_matches('"');
        let Some(rest) = inner.strip_prefix("mix ") else { continue };
        let Some((name, expr)) = rest.split_once('`') else { continue };
        let name = name.trim();
        let Some(slot) = ACTIONS.iter().position(|&a| a == name) else { continue };
        let expr = expr.split('`').next().unwrap_or("");
        if let Some(vk) = first_keyboard_vk(expr) {
            out[slot] = vk;
        }
    }
    out
}

fn first_keyboard_vk(expr: &str) -> Option<u32> {
    let mut cursor = expr;
    while let Some(pos) = cursor.find("keyboard.") {
        let after = &cursor[pos + "keyboard.".len()..];
        let token_len = after.find(|c: char| !c.is_ascii_alphanumeric() && c != '_').unwrap_or(after.len());
        let token = &after[..token_len];
        if let Some(vk) = scs_key_to_vk(token) {
            return Some(vk);
        }
        cursor = &after[token_len..];
    }
    None
}

fn scs_key_to_vk(name: &str) -> Option<u32> {
    if name.len() == 1 {
        let b = name.as_bytes()[0];
        if b.is_ascii_lowercase() {
            return Some(u32::from(b.to_ascii_uppercase()));
        }
        if b.is_ascii_digit() {
            return Some(u32::from(b));
        }
    }
    match name {
        "f1" => Some(0x70),
        "f2" => Some(0x71),
        "f3" => Some(0x72),
        "f4" => Some(0x73),
        "f5" => Some(0x74),
        "f6" => Some(0x75),
        "f7" => Some(0x76),
        "f8" => Some(0x77),
        "f9" => Some(0x78),
        "f10" => Some(0x79),
        "f11" => Some(0x7A),
        "f12" => Some(0x7B),
        "return" | "enter" => Some(0x0D),
        "esc" | "escape" => Some(0x1B),
        "space" => Some(0x20),
        "tab" => Some(0x09),
        "backspace" => Some(0x08),
        "key1" => Some(0x31),
        "key2" => Some(0x32),
        "key3" => Some(0x33),
        "key4" => Some(0x34),
        "key5" => Some(0x35),
        "key6" => Some(0x36),
        "key7" => Some(0x37),
        "key8" => Some(0x38),
        "key9" => Some(0x39),
        "key0" => Some(0x30),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicI32, AtomicU32};

    fn block() -> GameActionBlock {
        GameActionBlock {
            action: AtomicU32::new(0),
            flags: AtomicU32::new(0),
            key_vks: Default::default(),
            request: AtomicU32::new(10),
            answered: AtomicU32::new(10),
            answer: AtomicI32::new(0),
        }
    }

    #[test]
    fn sends_request_and_returns_plugin_answer_or_timeout() {
        let (block, mut actions, now) = (block(), GameActions::default(), Instant::now());
        let keys = [0x76, 0x0D, 0x46, 0x47, 0x1B];
        assert_eq!(actions.ask(&block, 3, GameAction::RoadsideTowToService, true, &keys, now), None);
        assert_eq!(block.action.load(Ordering::Relaxed), GameAction::RoadsideTowToService as u32);
        assert_eq!(block.flags.load(Ordering::Relaxed), GAME_ACTION_FLAG_AUTO_CONFIRM);
        assert_eq!(block.request.load(Ordering::Relaxed), 11);
        assert_eq!(actions.answer(&block, now), None);

        block.answer.store(GameActionAnswer::Done as i32, Ordering::Relaxed);
        block.answered.store(11, Ordering::Release);
        assert_eq!(
            actions.answer(&block, now).as_deref(),
            Some(r#"{"answer":"done","id":3,"type":"gameActionAnswer"}"#)
        );
        assert_eq!(actions.answer(&block, now), None);

        actions.ask(&block, 4, GameAction::ToggleHazardLights, false, &keys, now);
        assert_eq!(
            actions.answer(&block, now + ANSWER_WITHIN).as_deref(),
            Some(r#"{"answer":"noAnswer","id":4,"type":"gameActionAnswer"}"#)
        );
    }

    #[test]
    fn parses_controls_sii_keyboard_mix_lines() {
        let controls = r#"
 config_lines[10]: "mix advpage3 `keyboard.f8?0 | joy.b7?0`"
 config_lines[11]: "mix activate `keyboard.return?0 | joy.b1?0`"
 config_lines[12]: "mix flasher4way `keyboard.h?0`"
 config_lines[13]: "mix gar_man `keyboard.g?0`"
 config_lines[14]: "mix menu `keyboard.esc?0`"
"#;
        assert_eq!(parse_controls_keybinds(controls), [0x77, 0x0D, 0x48, 0x47, 0x1B]);
    }
}
