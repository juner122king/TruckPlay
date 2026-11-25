//! Douyin (douyin.com) in a hidden WebView2.
//! Controlled by WestPlay's cabin UI (ui/src/cabin/apps/douyin).

use std::cell::{Cell, RefCell};
use std::path::Path;

use crate::signin::{self, Progress, SignInWindow};
use crate::speakers::{self, CabCache, Equalizer, Head, Speaker};
use crate::webview::{self, OffscreenWebView, PageSize, Stage};

pub const HOME: &str = "https://www.douyin.com/";

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Command {
    Start,
    SignIn,
    SignOut,
    Play {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        video: Option<Video>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        index: Option<usize>,
    },
    Pause,
    Toggle,
    Next,
    Previous,
    Seek {
        seconds: f64,
    },
    Volume {
        percent: f64,
    },
    Mute {
        muted: bool,
    },
    Rate {
        rate: f64,
    },
    AutoScroll {
        on: bool,
    },
    Channel {
        channel: String,
    },
    Refresh,
    Like {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },
    Collect {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },
    Show {
        x: f32,
        y: f32,
        width: u32,
        height: u32,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        crop: bool,
    },
    Crop {
        on: bool,
    },
    Hide,
    Ask {
        id: u32,
        question: Question,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "ask", rename_all = "camelCase")]
pub enum Question {
    Feed {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        channel: Option<String>,
    },
    Search {
        query: String,
    },
    Profile,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Video {
    pub id: String,
    pub title: String,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    #[serde(default)]
    pub duration: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collected: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub likes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comments: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collects: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shares: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub music: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_live: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playback {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub title: String,
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork: Option<String>,
    pub duration: f64,
    pub position: f64,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collected: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub likes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comments: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub music: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rate: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub muted: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_scroll: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub buffering: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_ready: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_vertical: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub signed_in: bool,
    pub playing: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nickname: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
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
    pub videos: Option<Vec<Video>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum Report {
    State(State),
    SignInWindow(bool),
    Playback(Option<Playback>),
    Answer(Answer),
    Spectrum(Vec<u8>),
}

pub struct Douyin {
    view: OffscreenWebView,
    frame: PageSize,
    sign_in: RefCell<Option<SignInWindow>>,
    pending: RefCell<Vec<Report>>,
    checked_initial_cookie: Cell<bool>,
    told: RefCell<CabCache>,
}

impl Douyin {
    pub fn start(stage: &Stage, width: u32, height: u32, user_data: &Path) -> Result<Self, webview::Error> {
        let view = OffscreenWebView::new(stage, width, height, user_data)?;
        view.log_as("douyin")?;
        view.show(false)?;
        stage.add(&view, false)?;
        view.add_startup_script(concat!(include_str!("cab_sound.js"), "\n", include_str!("douyin.js")))?;
        view.navigate(HOME)?;
        let frame = stage.page_size();
        Ok(Self {
            view,
            frame,
            sign_in: RefCell::new(None),
            pending: RefCell::new(Vec::new()),
            checked_initial_cookie: Cell::new(false),
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

    pub fn command(&self, command: &Command) -> windows::core::Result<()> {
        match command {
            Command::Show { x, y, width, height, crop } => {
                let _ = self.pass(&Command::Crop { on: *crop });
                let page = self.frame.get();
                let (x, y, width, height) = crate::youtube::within(page, *x, *y, *width, *height);
                if width * 2 < page.0 {
                    self.view.fit(page, x, y, width, height)?;
                } else {
                    self.view.place(x, y, width, height)?;
                }
                self.view.show(true)
            }
            Command::Hide => self.view.show(false),
            Command::SignIn => {
                self.sign_in();
                Ok(())
            }
            Command::SignOut => {
                let _ = self.view.delete_cookies();
                self.told.borrow_mut().reset();
                let _ = self.view.navigate(HOME);
                self.pending.borrow_mut().push(Report::State(State {
                    signed_in: false,
                    playing: false,
                    nickname: None,
                    avatar: None,
                }));
                Ok(())
            }
            other => self.pass(other),
        }
    }

    fn pass(&self, command: &Command) -> windows::core::Result<()> {
        if let Ok(json) = serde_json::to_string(command) {
            self.view.post_json(&json)?;
        }
        Ok(())
    }

    pub fn sign_in(&self) {
        if self.sign_in.borrow().as_ref().is_some_and(|w| w.progress() == Progress::Signing) {
            if let Some(window) = self.sign_in.borrow().as_ref() {
                window.bring_forward();
            }
            return;
        }
        match SignInWindow::open(self.view.environment(), &signin::DOUYIN) {
            Ok(window) => {
                *self.sign_in.borrow_mut() = Some(window);
                self.pending.borrow_mut().push(Report::SignInWindow(true));
            }
            Err(e) => {
                crate::log!("[douyin] sign-in window failed: {e}");
            }
        }
    }

    pub fn take_reports(&self) -> Vec<Report> {
        let mut reports = std::mem::take(&mut *self.pending.borrow_mut());

        if !self.checked_initial_cookie.get() {
            self.checked_initial_cookie.set(true);
            let signed_in = self.view.has_cookie(HOME, &["sessionid", "sessionid_ss", "sid_tt"]);
            if signed_in {
                reports.push(Report::State(State { signed_in: true, playing: false, nickname: None, avatar: None }));
            }
        }

        let progress = self.sign_in.borrow().as_ref().map(SignInWindow::progress);
        if let Some(p @ (Progress::SignedIn | Progress::Closed)) = progress {
            self.sign_in.borrow_mut().take();
            reports.push(Report::SignInWindow(false));
            self.told.borrow_mut().reset();
            let _ = self.view.navigate(HOME);
            let signed_in =
                p == Progress::SignedIn || self.view.has_cookie(HOME, &["sessionid", "sessionid_ss", "sid_tt"]);
            reports.push(Report::State(State { signed_in, playing: false, nickname: None, avatar: None }));
        }

        for message in self.view.take_page_messages() {
            if let Some(bars) = speakers::read_spectrum(&message) {
                reports.push(Report::Spectrum(bars));
                continue;
            }
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&message) {
                let msg_type = value.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match msg_type {
                    "state" => {
                        if let Some(state_val) = value.get("state") {
                            if let Ok(mut s) = serde_json::from_value::<State>(state_val.clone()) {
                                if !s.signed_in && self.view.has_cookie(HOME, &["sessionid", "sessionid_ss", "sid_tt"])
                                {
                                    s.signed_in = true;
                                }
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
            self.view.post_json(&message)?;
        }
        Ok(())
    }
}

pub fn state_message(state: Option<&State>, signing_in: bool) -> String {
    let signed_in = state.map(|s| s.signed_in);
    let playing = state.map(|s| s.playing);
    let nickname = state.and_then(|s| s.nickname.as_deref());
    let avatar = state.and_then(|s| s.avatar.as_deref());
    serde_json::json!({
        "type": "douyin",
        "signedIn": signed_in,
        "playing": playing,
        "signingIn": signing_in,
        "nickname": nickname,
        "avatar": avatar,
    })
    .to_string()
}

pub fn playback_message(playback: Option<&Playback>) -> String {
    serde_json::json!({
        "type": "douyinPlayback",
        "playback": playback,
    })
    .to_string()
}

pub fn answer_message(answer: &Answer) -> String {
    serde_json::json!({
        "type": "douyinAnswer",
        "id": answer.id,
        "failed": answer.failed,
        "error": answer.error,
        "videos": answer.videos,
        "channel": answer.channel,
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_extended_commands() {
        let cmds = [
            Command::Channel { channel: "jingxuan".into() },
            Command::Rate { rate: 1.5 },
            Command::Mute { muted: true },
            Command::AutoScroll { on: false },
            Command::Collect { id: Some("7400001".into()) },
            Command::Refresh,
            Command::Ask { id: 7, question: Question::Feed { channel: Some("car".into()) } },
        ];
        for cmd in cmds {
            let json = serde_json::to_string(&cmd).unwrap();
            let back: Command = serde_json::from_str(&json).unwrap();
            assert_eq!(back, cmd);
        }
    }

    #[test]
    fn serializes_state_with_profile() {
        let state = State {
            signed_in: true,
            playing: true,
            nickname: Some("老张重卡".into()),
            avatar: Some("https://example.com/a.jpg".into()),
        };
        let msg: serde_json::Value = serde_json::from_str(&state_message(Some(&state), false)).unwrap();
        assert_eq!(msg["type"], "douyin");
        assert_eq!(msg["signedIn"], true);
        assert_eq!(msg["playing"], true);
        assert_eq!(msg["nickname"], "老张重卡");
        assert_eq!(msg["avatar"], "https://example.com/a.jpg");
    }
}
