//! QQ Music (y.qq.com) in a hidden WebView2.
//! Controlled by WestPlay's cabin UI (ui/src/cabin/apps/qqmusic).

use std::cell::{Cell, RefCell};
use std::path::Path;

use crate::signin::{self, Progress, SignInWindow};
use crate::speakers::{self, CabCache, Equalizer, Head, Speaker};
use crate::webview::{self, OffscreenWebView, Stage};

pub const HOME: &str = "https://y.qq.com/";
const AUTH_COOKIES: &[&str] = &["qqmusic_key", "qm_keyst", "wxst"];

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Command {
    Start,
    SignIn,
    SignOut,
    Play {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        track: Option<Track>,
    },
    Pause,
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
    Search {
        query: String,
    },
    Recommend,
    Chart {
        id: String,
    },
    UserPlaylists,
    PlaylistTracks {
        playlist_id: String,
    },
    Radios,
    RadioSongs {
        radio_id: String,
    },
    UserArtists,
    ArtistSongs {
        artist_id: String,
    },
    Lyrics {
        id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        song_id: Option<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_img_url: Option<String>,
    #[serde(default)]
    pub track_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subscribed: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Radio {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pic_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dj_name: Option<String>,
    #[serde(default)]
    pub program_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sub_count: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Artist {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pic_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_size: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub music_size: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    /// Song MID (e.g. `0039MnYb0qxYhV`), the primary identifier on QQ Music.
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub song_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_mid: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pay_play: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playable: Option<bool>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub signed_in: bool,
    pub playing: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nickname: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vip_type: Option<u32>,
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
    pub songs: Option<Vec<Track>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playlists: Option<Vec<Playlist>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radios: Option<Vec<Radio>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artists: Option<Vec<Artist>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lyric: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum Report {
    State(State),
    SignInWindow(bool),
    Playback(Option<Playback>),
    Answer(Answer),
    Spectrum(Vec<u8>),
}

pub struct Qqmusic {
    view: OffscreenWebView,
    sign_in: RefCell<Option<SignInWindow>>,
    pending: RefCell<Vec<Report>>,
    checked_initial_cookie: Cell<bool>,
    told: RefCell<CabCache>,
}

impl Qqmusic {
    pub fn start(stage: &Stage, width: u32, height: u32, user_data: &Path) -> Result<Self, webview::Error> {
        let view = OffscreenWebView::new(stage, width, height, user_data)?;
        view.log_as("qqmusic")?;
        view.show(false)?;
        stage.add(&view, false)?;
        view.add_startup_script(concat!(include_str!("cab_sound.js"), "\n", include_str!("qqmusic.js")))?;
        view.serve_blank_document(HOME)?;
        view.navigate(HOME)?;
        Ok(Self {
            view,
            sign_in: RefCell::new(None),
            pending: RefCell::new(Vec::new()),
            checked_initial_cookie: Cell::new(false),
            told: RefCell::default(),
        })
    }

    pub fn view(&self) -> &OffscreenWebView {
        &self.view
    }

    pub fn failed(&self) -> bool {
        self.view.take_failure().is_some()
    }

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
            self.told.borrow_mut().reset();
            let _ = self.view.navigate(HOME);
            self.pending.borrow_mut().push(Report::State(State {
                signed_in: false,
                playing: false,
                ..Default::default()
            }));
            return;
        }
        if let Ok(json) = serde_json::to_string(command) {
            let _ = self.view.post_json(&json);
        }
    }

    pub fn sign_in(&self) {
        if self.sign_in.borrow().as_ref().is_some_and(|w| w.progress() == Progress::Signing) {
            if let Some(window) = self.sign_in.borrow().as_ref() {
                window.bring_forward();
            }
            return;
        }
        match SignInWindow::open(self.view.environment(), &signin::QQMUSIC) {
            Ok(window) => {
                *self.sign_in.borrow_mut() = Some(window);
                self.pending.borrow_mut().push(Report::SignInWindow(true));
            }
            Err(e) => {
                crate::log!("[qqmusic] sign-in window failed: {e}");
            }
        }
    }

    pub fn take_reports(&self) -> Vec<Report> {
        let mut reports = std::mem::take(&mut *self.pending.borrow_mut());

        if !self.checked_initial_cookie.get() {
            self.checked_initial_cookie.set(true);
            let signed_in = self.view.has_cookie(HOME, AUTH_COOKIES);
            if signed_in {
                reports.push(Report::State(State { signed_in: true, playing: false, ..Default::default() }));
            }
        }

        let progress = self.sign_in.borrow().as_ref().map(SignInWindow::progress);
        if let Some(p @ (Progress::SignedIn | Progress::Closed)) = progress {
            self.sign_in.borrow_mut().take();
            reports.push(Report::SignInWindow(false));
            self.told.borrow_mut().reset();
            let _ = self.view.navigate(HOME);
            let signed_in = p == Progress::SignedIn || self.view.has_cookie(HOME, AUTH_COOKIES);
            reports.push(Report::State(State { signed_in, playing: false, ..Default::default() }));
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
                        if let Some(state_val) = value.get("state")
                            && let Ok(s) = serde_json::from_value::<State>(state_val.clone())
                        {
                            reports.push(Report::State(s));
                        }
                    }
                    "playback" => {
                        let pb =
                            value.get("playback").and_then(|p| serde_json::from_value::<Playback>(p.clone()).ok());
                        reports.push(Report::Playback(pb));
                    }
                    "answer" => {
                        if let Some(ans_val) = value.get("answer")
                            && let Ok(a) = serde_json::from_value::<Answer>(ans_val.clone())
                        {
                            reports.push(Report::Answer(a));
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
    let avatar_url = state.and_then(|s| s.avatar_url.as_deref());
    let vip_type = state.and_then(|s| s.vip_type);
    serde_json::json!({
        "type": "qqmusic",
        "signedIn": signed_in,
        "playing": playing,
        "signingIn": signing_in,
        "nickname": nickname,
        "avatarUrl": avatar_url,
        "vipType": vip_type,
    })
    .to_string()
}

pub fn playback_message(playback: Option<&Playback>) -> String {
    serde_json::json!({
        "type": "qqmusicPlayback",
        "playback": playback,
    })
    .to_string()
}

pub fn answer_message(answer: &Answer) -> String {
    serde_json::json!({
        "type": "qqmusicAnswer",
        "id": answer.id,
        "failed": answer.failed,
        "error": answer.error,
        "songs": answer.songs,
        "playlists": answer.playlists,
        "radios": answer.radios,
        "artists": answer.artists,
        "lyric": answer.lyric,
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn questions_use_camel_case_fields() {
        let pl_cmd: Command = serde_json::from_str(
            r#"{"action":"ask","id":20,"question":{"ask":"playlistTracks","playlistId":"8877118200"}}"#,
        )
        .expect("deserialize playlistTracks command");
        assert_eq!(
            pl_cmd,
            Command::Ask { id: 20, question: Question::PlaylistTracks { playlist_id: "8877118200".to_owned() } }
        );
        let pl_out = serde_json::to_value(&pl_cmd).expect("serialize playlistTracks");
        assert_eq!(pl_out["question"]["ask"], "playlistTracks");
        assert_eq!(pl_out["question"]["playlistId"], "8877118200");

        let radio_cmd: Command =
            serde_json::from_str(r#"{"action":"ask","id":21,"question":{"ask":"radioSongs","radioId":"99"}}"#)
                .expect("deserialize radioSongs");
        assert_eq!(radio_cmd, Command::Ask { id: 21, question: Question::RadioSongs { radio_id: "99".to_owned() } });
        let radio_out = serde_json::to_value(&radio_cmd).expect("serialize radioSongs");
        assert_eq!(radio_out["question"]["radioId"], "99");

        let lyric_cmd: Command = serde_json::from_str(
            r#"{"action":"ask","id":22,"question":{"ask":"lyrics","id":"0039MnYb0qxYhV","songId":"97773"}}"#,
        )
        .expect("deserialize lyrics");
        assert_eq!(
            lyric_cmd,
            Command::Ask {
                id: 22,
                question: Question::Lyrics { id: "0039MnYb0qxYhV".to_owned(), song_id: Some("97773".to_owned()) },
            }
        );
        let lyric_out = serde_json::to_value(&lyric_cmd).expect("serialize lyrics");
        assert_eq!(lyric_out["question"]["songId"], "97773");
    }

    #[test]
    fn track_and_playback_preserve_pay_play_and_auth_error_fields() {
        let track_json = r#"{"id":"0039MnYb0qxYhV","songId":"97773","mediaMid":"0039MnYb0qxYhV","title":"晴天","artist":"周杰伦","album":"叶惠美","duration":269,"payPlay":1,"playable":true}"#;
        let track: Track = serde_json::from_str(track_json).expect("deserialize track");
        assert_eq!(track.id, "0039MnYb0qxYhV");
        assert_eq!(track.song_id.as_deref(), Some("97773"));
        assert_eq!(track.media_mid.as_deref(), Some("0039MnYb0qxYhV"));
        assert_eq!(track.pay_play, Some(1));
        assert_eq!(track.playable, Some(true));

        let login_pb = Playback {
            title: "晴天".to_owned(),
            artist: "周杰伦".to_owned(),
            artwork: None,
            duration: 269.0,
            position: 0.0,
            status: "paused".to_owned(),
            track_id: Some("0039MnYb0qxYhV".to_owned()),
            error: Some("login_required".to_owned()),
        };
        let encoded_login = playback_message(Some(&login_pb));
        let parsed_login: serde_json::Value = serde_json::from_str(&encoded_login).expect("parse login playback");
        assert_eq!(parsed_login["type"], "qqmusicPlayback");
        assert_eq!(parsed_login["playback"]["trackId"], "0039MnYb0qxYhV");
        assert_eq!(parsed_login["playback"]["error"], "login_required");

        let vip_pb = Playback { error: Some("vip_required".to_owned()), ..login_pb };
        let parsed_vip: serde_json::Value =
            serde_json::from_str(&playback_message(Some(&vip_pb))).expect("parse vip playback");
        assert_eq!(parsed_vip["playback"]["error"], "vip_required");
    }

    #[test]
    fn state_and_answer_messages_preserve_qqmusic_wire_format() {
        let state: State = serde_json::from_str(
            r#"{"signedIn":true,"playing":true,"nickname":"车友小绿","avatarUrl":"https://q.qlogo.cn/head.jpg","vipType":2}"#,
        )
        .expect("deserialize state");
        let parsed_state: serde_json::Value =
            serde_json::from_str(&state_message(Some(&state), false)).expect("parse state message");
        assert_eq!(parsed_state["type"], "qqmusic");
        assert_eq!(parsed_state["signedIn"], true);
        assert_eq!(parsed_state["playing"], true);
        assert_eq!(parsed_state["signingIn"], false);
        assert_eq!(parsed_state["nickname"], "车友小绿");
        assert_eq!(parsed_state["avatarUrl"], "https://q.qlogo.cn/head.jpg");
        assert_eq!(parsed_state["vipType"], 2);

        let ans = Answer {
            id: 42,
            failed: false,
            error: None,
            songs: None,
            playlists: Some(vec![Playlist {
                id: "201".to_owned(),
                name: "我喜欢".to_owned(),
                cover_img_url: Some("https://y.gtimg.cn/cover.jpg".to_owned()),
                track_count: 88,
                play_count: Some(1200),
                subscribed: Some(false),
            }]),
            radios: Some(vec![Radio {
                id: "99".to_owned(),
                name: "车载流行电台".to_owned(),
                pic_url: Some("https://y.gtimg.cn/radio.jpg".to_owned()),
                dj_name: Some("场景".to_owned()),
                program_count: 0,
                sub_count: Some(45000),
            }]),
            artists: Some(vec![Artist {
                id: "0025NhlN2yWrP4".to_owned(),
                name: "周杰伦".to_owned(),
                pic_url: Some("https://y.gtimg.cn/artist.jpg".to_owned()),
                album_size: Some(36),
                music_size: Some(320),
            }]),
            lyric: Some("[00:00.00]晴天 - 周杰伦".to_owned()),
        };
        let parsed_ans: serde_json::Value = serde_json::from_str(&answer_message(&ans)).expect("parse answer message");
        assert_eq!(parsed_ans["type"], "qqmusicAnswer");
        assert_eq!(parsed_ans["playlists"][0]["trackCount"], 88);
        assert_eq!(parsed_ans["radios"][0]["djName"], "场景");
        assert_eq!(parsed_ans["artists"][0]["musicSize"], 320);
        assert_eq!(parsed_ans["lyric"], "[00:00.00]晴天 - 周杰伦");
    }
}
