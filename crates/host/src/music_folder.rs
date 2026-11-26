//! Player (ui/src/cabin/apps/player): the game's music folder (`<the game's Documents folder>/music`, one for
//! all its profiles: the songs the player put there for the game's radio) and its separate video folder
//! (`<the game's Documents folder>/videos`), listed with what their tags say (a file without tags: its file's
//! name), and played in a WebView of its own under the cabin page, its sound through the truck's own speakers
//! as the music services' is (`cab_sound.js`).
//!
//! Listed off the host's thread (reading tags takes a while with many files), again whenever either folder
//! changes. Covers come from the files' tags, kept in WestPlay's data folder for the cab to show
//! (`https://westplay.music-covers/`); the media files themselves are streamed to the player's page over a
//! loopback HTTP server with byte-range (`206 Partial Content`) support so large videos seek cleanly without
//! copying, moving or writing anything in the game's folders.

use std::cell::RefCell;
use std::collections::BTreeSet;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock, mpsc};
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime};

use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::{MimeType, PictureType};
use lofty::tag::Accessor;
use westplay_setup::game::Kind;
use westplay_setup::places;

use crate::speakers::{self, Equalizer, Head, Speaker};
use crate::webview::{self, OffscreenWebView, PageSize, Stage};

/// Where extracted media covers are served to the cabin page.
pub const COVERS_HOST: &str = "westplay.music-covers";

/// Audio formats Player plays from the `music` folder (the browser's own: MP3, Ogg Vorbis/Opus, FLAC, WAV, AAC).
const AUDIO_KINDS: [&str; 8] = ["mp3", "ogg", "oga", "opus", "flac", "wav", "m4a", "aac"];

/// Video formats Player plays from the `videos` folder (browser-supported containers).
const VIDEO_KINDS: [&str; 5] = ["mp4", "m4v", "webm", "mov", "mkv"];

/// How often the folders are looked at for files added, removed or changed.
const LOOK_EVERY: Duration = Duration::from_secs(3);

/// Streaming buffer size per HTTP response write (64 KiB).
const STREAM_CHUNK: usize = 64 * 1024;

/// Maximum simultaneous loopback HTTP connections serving media chunks.
const MAX_CLIENTS: usize = 16;

/// Media type: audio (from `music/`) or video (from `videos/`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MediaKind {
    #[default]
    Audio,
    Video,
}

/// Both local folders watched for Player: the game's `music` folder and its separate `videos` folder.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Folders {
    pub music: Option<PathBuf>,
    pub videos: Option<PathBuf>,
}

impl Folders {
    pub fn of(kind: Kind) -> Self {
        Self { music: folder_of(kind), videos: videos_folder_of(kind) }
    }
}

/// The game `kind`'s music folder (it may not be there: the game makes it only when asked to).
pub fn folder_of(kind: Kind) -> Option<PathBuf> {
    Some(places::game_documents(kind)?.join("music"))
}

/// The game `kind`'s separate videos folder (`<Documents>/<Game>/videos`).
pub fn videos_folder_of(kind: Kind) -> Option<PathBuf> {
    Some(places::game_documents(kind)?.join("videos"))
}

/// A file of the folder: its name, media kind, and what its tags say (none of them on a file without tags):
/// its title, its artist, how long it is (seconds; 0: not known) and its cover (a file of the covers' folder).
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub file: String,
    pub kind: MediaKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    pub seconds: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
}

fn has_extension(name: &str, allowed: &[&str]) -> bool {
    Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| allowed.iter().any(|kind| kind.eq_ignore_ascii_case(ext)))
}

/// Whether `name` is an audio file Player plays (by its extension, in any case).
fn plays_audio(name: &str) -> bool {
    has_extension(name, &AUDIO_KINDS)
}

/// Whether `name` is a video file Player plays (by its extension, in any case).
fn plays_video(name: &str) -> bool {
    has_extension(name, &VIDEO_KINDS)
}

/// Whether `name` is a file Player plays for `kind` (by its extension, in any case).
fn plays(name: &str, kind: MediaKind) -> bool {
    match kind {
        MediaKind::Audio => plays_audio(name),
        MediaKind::Video => plays_video(name),
    }
}

fn mime_type(name: &str) -> &'static str {
    let ext = Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("");
    if ext.eq_ignore_ascii_case("mp3") {
        "audio/mpeg"
    } else if ext.eq_ignore_ascii_case("ogg") || ext.eq_ignore_ascii_case("oga") {
        "audio/ogg"
    } else if ext.eq_ignore_ascii_case("opus") {
        "audio/opus"
    } else if ext.eq_ignore_ascii_case("flac") {
        "audio/flac"
    } else if ext.eq_ignore_ascii_case("wav") {
        "audio/wav"
    } else if ext.eq_ignore_ascii_case("m4a") {
        "audio/mp4"
    } else if ext.eq_ignore_ascii_case("aac") {
        "audio/aac"
    } else if ext.eq_ignore_ascii_case("mp4") || ext.eq_ignore_ascii_case("m4v") {
        "video/mp4"
    } else if ext.eq_ignore_ascii_case("webm") {
        "video/webm"
    } else if ext.eq_ignore_ascii_case("mov") {
        "video/quicktime"
    } else if ext.eq_ignore_ascii_case("mkv") {
        "video/x-matroska"
    } else {
        "application/octet-stream"
    }
}

/// A folder's files as they are on disk: each file's name, size and when it was written (to see a change).
type Files = Vec<(String, u64, Option<SystemTime>)>;

/// The folder's playable files of `kind`, as they are on disk now.
fn look(folder: &Path, kind: MediaKind) -> Files {
    let mut files: Vec<_> = std::fs::read_dir(folder)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|ft| ft.is_file()))
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let meta = entry.metadata().ok()?;
            plays(&name, kind).then(|| (name, meta.len(), meta.modified().ok()))
        })
        .collect();
    files.sort_by(|a, b| natural(&a.0, &b.0));
    files
}

/// File names in the order Explorer lists them: case left aside, and numbers by their value (`2 x` before `10 x`).
fn natural(a: &str, b: &str) -> std::cmp::Ordering {
    let (a, b) = (a.to_lowercase(), b.to_lowercase());
    let (mut a, mut b) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (a.peek().copied(), b.peek().copied()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, _) => return std::cmp::Ordering::Less,
            (_, None) => return std::cmp::Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let number = |chars: &mut std::iter::Peekable<std::str::Chars>| {
                    let mut digits = String::new();
                    while let Some(c) = chars.peek().copied().filter(char::is_ascii_digit) {
                        digits.push(c);
                        chars.next();
                    }
                    digits
                };
                let (x, y) = (number(&mut a), number(&mut b));
                let (x, y) = (x.trim_start_matches('0'), y.trim_start_matches('0'));
                let order = x.len().cmp(&y.len()).then_with(|| x.cmp(y));
                if order != std::cmp::Ordering::Equal {
                    return order;
                }
            }
            (Some(x), Some(y)) => {
                if x != y {
                    return x.cmp(&y);
                }
                a.next();
                b.next();
            }
        }
    }
}

/// A media file's tags (none that can't be read: its file's name stands), its cover kept in `covers` (named by
/// its bytes, so a cover shared by an album's songs is kept once).
fn read_media(folder: &Path, file: &str, kind: MediaKind, covers: &Path, kept: &mut BTreeSet<String>) -> Song {
    let mut item = Song { file: file.to_owned(), kind, title: None, artist: None, seconds: 0.0, cover: None };
    let Ok(tagged) = lofty::read_from_path(folder.join(file)) else { return item };
    item.seconds = tagged.properties().duration().as_secs_f64();
    let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else { return item };
    let text = |value: Option<std::borrow::Cow<str>>| value.map(|v| v.trim().to_owned()).filter(|v| !v.is_empty());
    item.title = text(tag.title());
    item.artist = text(tag.artist());
    let pictures = tag.pictures();
    let picture =
        pictures.iter().find(|picture| picture.pic_type() == PictureType::CoverFront).or_else(|| pictures.first());
    if let Some(picture) = picture {
        let extension = match picture.mime_type() {
            Some(MimeType::Png) => Some("png"),
            Some(MimeType::Jpeg) => Some("jpg"),
            Some(MimeType::Gif) => Some("gif"),
            Some(MimeType::Bmp) => Some("bmp"),
            _ => None,
        };
        if let Some(extension) = extension {
            let name = format!("{:016x}.{extension}", fnv(picture.data()));
            let path = covers.join(&name);
            if path.is_file() || std::fs::write(&path, picture.data()).is_ok() {
                kept.insert(name.clone());
                item.cover = Some(name);
            }
        }
    }
    item
}

/// FNV-1a, 64-bit: a cover's name from its bytes.
fn fnv(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| (hash ^ u64::from(*byte)).wrapping_mul(0x0100_0000_01b3))
}

/// Reads songs from `music` and videos from `videos` with their tags (covers kept in `covers`, orphaned covers
/// removed).
pub fn read_all(music: Option<&Path>, videos: Option<&Path>, covers: &Path) -> (Vec<Song>, Vec<Song>) {
    let _ = std::fs::create_dir_all(covers);
    let mut kept = BTreeSet::new();
    let songs = music
        .map(|dir| {
            look(dir, MediaKind::Audio)
                .iter()
                .map(|(file, _, _)| read_media(dir, file, MediaKind::Audio, covers, &mut kept))
                .collect()
        })
        .unwrap_or_default();
    let video_items = videos
        .map(|dir| {
            look(dir, MediaKind::Video)
                .iter()
                .map(|(file, _, _)| read_media(dir, file, MediaKind::Video, covers, &mut kept))
                .collect()
        })
        .unwrap_or_default();
    for entry in std::fs::read_dir(covers).into_iter().flatten().flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !kept.contains(&name) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    (songs, video_items)
}

/// `{"type":"musicFolder","folder":"…","videosFolder":"…","songs":[…],"videos":[…]}` for the cabin page.
pub fn folder_message(
    music: Option<&Path>,
    videos: Option<&Path>,
    songs: &[Song],
    video_items: &[Song],
) -> String {
    serde_json::json!({
        "type": "musicFolder",
        "folder": music.map(|folder| folder.display().to_string()),
        "videosFolder": videos.map(|folder| folder.display().to_string()),
        "songs": songs,
        "videos": video_items,
    })
    .to_string()
}

/// The music and videos folders, watched off the host's thread: listed for the game the player plays (`game`),
/// and again as their files change.
pub struct FolderWatch {
    games: mpsc::Sender<Kind>,
    listed: mpsc::Receiver<(Folders, String)>,
}

impl FolderWatch {
    /// Watches ETS2's folders until the host says another game plays; covers kept in `covers`.
    pub fn start(covers: PathBuf) -> Self {
        let (games, game_changes) = mpsc::channel::<Kind>();
        let (lists, listed) = mpsc::channel();
        let _ = std::thread::Builder::new().name("westplay-music-folder".into()).spawn(move || {
            let mut kind = Kind::Ets2;
            let mut folders = Folders::of(kind);
            let mut seen: Option<(Folders, Files, Files)> = None;
            loop {
                loop {
                    match game_changes.try_recv() {
                        Ok(played) if played != kind => {
                            kind = played;
                            folders = Folders::of(kind);
                        }
                        Ok(_) => {}
                        Err(mpsc::TryRecvError::Empty) => break,
                        // Its handle gone (the host's run ended): so does the watch (`worker`).
                        Err(mpsc::TryRecvError::Disconnected) => return,
                    }
                }
                let now_music = folders.music.as_deref().map(|d| look(d, MediaKind::Audio)).unwrap_or_default();
                let now_videos = folders.videos.as_deref().map(|d| look(d, MediaKind::Video)).unwrap_or_default();
                let snapshot = (folders.clone(), now_music, now_videos);
                if seen.as_ref() != Some(&snapshot) {
                    let (songs, video_items) =
                        read_all(folders.music.as_deref(), folders.videos.as_deref(), &covers);
                    log!(
                        "[player] {} songs in {:?}, {} videos in {:?}",
                        songs.len(),
                        folders.music.as_deref().map(Path::display),
                        video_items.len(),
                        folders.videos.as_deref().map(Path::display),
                    );
                    let message =
                        folder_message(folders.music.as_deref(), folders.videos.as_deref(), &songs, &video_items);
                    if lists.send((folders.clone(), message)).is_err() {
                        return;
                    }
                    seen = Some(snapshot);
                }
                std::thread::sleep(LOOK_EVERY);
            }
        });
        Self { games, listed }
    }

    /// The game the player plays now: its folders are the ones listed.
    pub fn game(&self, kind: Kind) {
        let _ = self.games.send(kind);
    }

    /// The folders and their media items (the message for the page), as last listed since the last call.
    pub fn take(&self) -> Option<(Folders, String)> {
        self.listed.try_iter().last()
    }
}

/// What the cabin page asks of the player (`player` in ui/src/shared/host.ts).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Command {
    /// Play `files` (the folder's, by name, in its order) from the one at `index` (shuffled, from any if none);
    /// `kind`: `audio` (`music/`) or `video` (`videos/`); with no files, play on.
    Play {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        files: Option<Vec<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        index: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        shuffle: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        kind: Option<MediaKind>,
    },
    Pause,
    Stop,
    Next,
    Previous,
    Seek {
        seconds: f64,
    },
    /// The player's volume, 0 to 100.
    Volume {
        percent: f64,
    },
    /// Playback speed (e.g. 0.75, 1, 1.25, 1.5, 2).
    Rate {
        rate: f64,
    },
    Shuffle {
        on: bool,
    },
    Repeat {
        mode: Repeat,
    },
    /// Show the video at this rectangle of the frame (pixels), under the cabin page.
    Show {
        x: f32,
        y: f32,
        width: u32,
        height: u32,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        crop: bool,
    },
    /// Fill (`object-fit: cover`) or fit (`contain`) the video within the player page.
    Crop {
        on: bool,
    },
    /// Hide the video surface (playback may continue in background).
    Hide,
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Repeat {
    Off,
    All,
    One,
}

impl Command {
    /// Only plain file names pass: never paths (nothing outside the configured folders is served anyway).
    fn checked(&self) -> Self {
        match self {
            Command::Play { files: Some(files), index, shuffle, kind } => Command::Play {
                files: Some(files.iter().filter(|file| is_name(file)).cloned().collect()),
                index: *index,
                shuffle: *shuffle,
                kind: *kind,
            },
            other => other.clone(),
        }
    }
}

/// A file's name alone: no folder in it, nor a way up out of the folder.
fn is_name(file: &str) -> bool {
    !file.is_empty() && !file.contains(['/', '\\', ':', '\0']) && file != "." && file != ".."
}

fn default_rate() -> f64 {
    1.0
}

/// What plays: the file, kind (audio/video), playing/loading/ended state, position and duration (seconds),
/// playback options, volume (0 to 1), speed, queue index/count, video dimensions, error, and optional poster.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playback {
    pub file: String,
    #[serde(default)]
    pub kind: MediaKind,
    pub playing: bool,
    #[serde(default)]
    pub loading: bool,
    #[serde(default)]
    pub ended: bool,
    #[serde(default)]
    pub position: f64,
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub shuffle: bool,
    pub repeat: Repeat,
    #[serde(default)]
    pub volume: Option<f64>,
    #[serde(default = "default_rate")]
    pub rate: f64,
    #[serde(default)]
    pub index: u32,
    #[serde(default)]
    pub count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub poster: Option<String>,
}

/// `{"type":"playerPlayback","playback":{…}}` for the cabin page (`null`: nothing plays).
pub fn playback_message(playback: Option<&Playback>) -> String {
    serde_json::json!({ "type": "playerPlayback", "playback": playback }).to_string()
}

/// Minimal HTML document served by [`MediaServer`] for the Player WebView.
const PLAYER_HTML: &[u8] = concat!(
    "<!doctype html><html data-westplay-player=\"1\"><head><meta charset=\"utf-8\"><title>Player</title>",
    "<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#000}",
    "video{position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#000;display:block}",
    "video.crop{object-fit:cover}</style></head><body></body></html>",
)
.as_bytes();

/// Loopback HTTP/1.1 server streaming `music/` and `videos/` files with `206 Partial Content` byte ranges.
struct MediaServer {
    port: u16,
    token: String,
    folders: Arc<RwLock<Folders>>,
    closed: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

struct ClientSlot(Arc<AtomicUsize>);

impl Drop for ClientSlot {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

impl MediaServer {
    fn start(folders: Folders) -> io::Result<Self> {
        let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))?;
        let port = listener.local_addr()?.port();

        let mut random = [0u8; 16];
        getrandom::fill(&mut random)
            .map_err(|e| io::Error::other(format!("player token generation failed: {e}")))?;
        let token: String = random.iter().map(|b| format!("{b:02x}")).collect();

        let shared_folders = Arc::new(RwLock::new(folders));
        let closed = Arc::new(AtomicBool::new(false));
        let active = Arc::new(AtomicUsize::new(0));

        let srv_token = token.clone();
        let srv_folders = shared_folders.clone();
        let srv_closed = closed.clone();
        let thread = std::thread::Builder::new().name("westplay-player-http".into()).spawn(move || {
            for incoming in listener.incoming() {
                if srv_closed.load(Ordering::Acquire) {
                    break;
                }
                let Ok(stream) = incoming else { continue };
                if active.fetch_add(1, Ordering::AcqRel) >= MAX_CLIENTS {
                    active.fetch_sub(1, Ordering::AcqRel);
                    let _ = write_simple(&stream, 503, "Service Unavailable");
                    continue;
                }
                let slot = ClientSlot(active.clone());
                let token = srv_token.clone();
                let folders = srv_folders.clone();
                let _ = std::thread::Builder::new().name("westplay-player-conn".into()).spawn(move || {
                    let _slot = slot;
                    handle_connection(stream, &token, &folders);
                });
            }
        })?;

        Ok(Self { port, token, folders: shared_folders, closed, thread: Some(thread) })
    }

    fn page_url(&self) -> String {
        format!("http://127.0.0.1:{}/{}/player.html", self.port, self.token)
    }

    fn set_folders(&self, folders: Folders) {
        *self.folders.write().unwrap_or_else(|e| e.into_inner()) = folders;
    }
}

impl Drop for MediaServer {
    fn drop(&mut self) {
        self.closed.store(true, Ordering::Release);
        // Wake the blocking accept() call on loopback so the thread exits promptly.
        let _ = TcpStream::connect(SocketAddrV4::new(Ipv4Addr::LOCALHOST, self.port));
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }
}

fn handle_connection(mut stream: TcpStream, token: &str, folders: &Arc<RwLock<Folders>>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(15)));

    let mut reader = BufReader::new(match stream.try_clone() {
        Ok(cloned) => cloned,
        Err(_) => return,
    });
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
        return;
    }
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("");

    let mut range_header: Option<String> = None;
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    break;
                }
                if let Some((name, value)) = trimmed.split_once(':')
                    && name.trim().eq_ignore_ascii_case("range")
                {
                    range_header = Some(value.trim().to_owned());
                }
            }
        }
    }

    if method.eq_ignore_ascii_case("OPTIONS") {
        let _ = stream.write_all(
            b"HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, HEAD, OPTIONS\r\nAccess-Control-Allow-Headers: Range\r\nConnection: close\r\n\r\n",
        );
        return;
    }
    let is_head = method.eq_ignore_ascii_case("HEAD");
    if !is_head && !method.eq_ignore_ascii_case("GET") {
        let _ = write_simple(&stream, 405, "Method Not Allowed");
        return;
    }

    let path_only = target.split('?').next().unwrap_or("");
    let prefix = format!("/{token}/");
    let Some(rest) = path_only.strip_prefix(&prefix) else {
        let _ = write_simple(&stream, 403, "Forbidden");
        return;
    };

    if rest == "player.html" {
        let header = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
            PLAYER_HTML.len()
        );
        let _ = stream.write_all(header.as_bytes());
        if !is_head {
            let _ = stream.write_all(PLAYER_HTML);
        }
        return;
    }

    let (kind, encoded) = if let Some(file) = rest.strip_prefix("music/") {
        (MediaKind::Audio, file)
    } else if let Some(file) = rest.strip_prefix("videos/") {
        (MediaKind::Video, file)
    } else {
        let _ = write_simple(&stream, 404, "Not Found");
        return;
    };

    let Some(file_name) = percent_decode(encoded) else {
        let _ = write_simple(&stream, 400, "Bad Request");
        return;
    };
    if !is_name(&file_name) || !plays(&file_name, kind) {
        let _ = write_simple(&stream, 404, "Not Found");
        return;
    }

    let base_dir = {
        let guard = folders.read().unwrap_or_else(|e| e.into_inner());
        match kind {
            MediaKind::Audio => guard.music.clone(),
            MediaKind::Video => guard.videos.clone(),
        }
    };
    let Some(dir) = base_dir else {
        let _ = write_simple(&stream, 404, "Not Found");
        return;
    };
    let path = dir.join(&file_name);
    let Ok(mut file) = File::open(&path) else {
        let _ = write_simple(&stream, 404, "Not Found");
        return;
    };
    let Ok(meta) = file.metadata() else {
        let _ = write_simple(&stream, 404, "Not Found");
        return;
    };
    let total = meta.len();
    let content_type = mime_type(&file_name);

    let (status, start, length, content_range) = if let Some(range) = range_header.as_deref() {
        match parse_range(range, total) {
            Ok((start, end)) => {
                let length = end - start + 1;
                ("206 Partial Content", start, length, Some(format!("bytes {start}-{end}/{total}")))
            }
            Err(()) => {
                let resp = format!(
                    "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{total}\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                );
                let _ = stream.write_all(resp.as_bytes());
                return;
            }
        }
    } else {
        ("200 OK", 0, total, None)
    };

    let mut header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {length}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\n"
    );
    if let Some(cr) = content_range {
        header.push_str(&format!("Content-Range: {cr}\r\n"));
    }
    header.push_str("Connection: close\r\n\r\n");

    if stream.write_all(header.as_bytes()).is_err() || is_head || length == 0 {
        return;
    }
    if start > 0 && file.seek(SeekFrom::Start(start)).is_err() {
        return;
    }

    let mut remaining = length;
    let mut buf = [0u8; STREAM_CHUNK];
    while remaining > 0 {
        let want = (remaining as usize).min(buf.len());
        let read = match file.read(&mut buf[..want]) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        if stream.write_all(&buf[..read]).is_err() {
            break;
        }
        remaining -= read as u64;
    }
}

fn write_simple(mut stream: &TcpStream, code: u16, reason: &str) -> io::Result<()> {
    let resp = format!(
        "HTTP/1.1 {code} {reason}\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(resp.as_bytes())
}

/// Decodes percent-encoded UTF-8 URL path segments (`%20` -> space, etc.).
fn percent_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return None;
            }
            let hi = hex_val(bytes[i + 1])?;
            let lo = hex_val(bytes[i + 2])?;
            out.push((hi << 4) | lo);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn hex_val(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// Parses a single HTTP `Range: bytes=start-end` header against a file of `total` bytes.
fn parse_range(header: &str, total: u64) -> Result<(u64, u64), ()> {
    if total == 0 {
        return Err(());
    }
    let spec = header.trim().strip_prefix("bytes=").ok_or(())?;
    // Only single-range requests are needed by media elements.
    if spec.contains(',') {
        return Err(());
    }
    let (start_str, end_str) = spec.split_once('-').ok_or(())?;
    let (start_str, end_str) = (start_str.trim(), end_str.trim());
    if start_str.is_empty() {
        let suffix: u64 = end_str.parse().map_err(|_| ())?;
        if suffix == 0 {
            return Err(());
        }
        let start = total.saturating_sub(suffix);
        Ok((start, total - 1))
    } else {
        let start: u64 = start_str.parse().map_err(|_| ())?;
        if start >= total {
            return Err(());
        }
        let end = if end_str.is_empty() {
            total - 1
        } else {
            let parsed: u64 = end_str.parse().map_err(|_| ())?;
            parsed.min(total - 1)
        };
        if end < start {
            return Err(());
        }
        Ok((start, end))
    }
}

/// What the host tells the player's page of the cab, as it tells the music services' (apple_music.rs).
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
enum Cab {
    Speakers {
        speakers: Option<Vec<Speaker>>,
    },
    Head {
        #[serde(flatten)]
        head: Head,
    },
    Outside {
        on: bool,
        distance: f32,
    },
    Equalizer {
        #[serde(flatten)]
        equalizer: Equalizer,
    },
    Spectrum {
        on: bool,
    },
}

/// What the page was told last of the cab (sent again to a page that loaded anew).
#[derive(Debug, Default)]
struct Told {
    speakers: Option<Option<Vec<Speaker>>>,
    head: Option<Head>,
    camera: Option<(bool, f32)>,
    equalizer: Option<Equalizer>,
    spectrum: Option<bool>,
    messages: [Option<String>; 5],
}

/// What the player's page said.
pub enum Report {
    /// The music's spectrum, while the cab's Equalizer asks for it ([`speakers::read_spectrum`]).
    Spectrum(Vec<u8>),
    /// What plays (`None`: nothing).
    Playback(Option<Box<Playback>>),
}

/// The player: its WebView, playing the folders' songs and videos.
pub struct Player {
    view: OffscreenWebView,
    frame: PageSize,
    server: MediaServer,
    told: RefCell<Told>,
}

impl Player {
    /// Opens the player's page in a WebView of `stage`'s frame, under the cabin page, on the cabin page's
    /// profile (`user_data`), streaming `folders` (`music/` and `videos/`) over loopback HTTP.
    pub fn start(
        stage: &Stage,
        width: u32,
        height: u32,
        user_data: &Path,
        folders: &Folders,
    ) -> Result<Self, webview::Error> {
        let server = MediaServer::start(folders.clone())?;
        let view = OffscreenWebView::new(stage, width, height, user_data)?;
        view.log_as("player")?;
        view.show(false)?;
        stage.add(&view, false)?;
        view.add_startup_script(concat!(include_str!("cab_sound.js"), "\n", include_str!("music_folder.js")))?;
        let page_url = server.page_url();
        let frame = stage.page_size();
        let player = Self { view, frame, server, told: RefCell::default() };
        player.view.navigate(&page_url)?;
        Ok(player)
    }

    /// Updates the music and videos folders served to the player.
    pub fn serve(&self, folders: &Folders) {
        self.server.set_folders(folders.clone());
    }

    /// The truck's speakers, the driver's head, the camera and the tone, told as they change (as Apple Music's
    /// page is: apple_music.rs).
    pub fn cab(
        &self,
        speakers: Option<&[Speaker]>,
        head: Head,
        outside: bool,
        distance: f32,
        equalizer: Equalizer,
        spectrum: bool,
    ) -> windows::core::Result<()> {
        let mut told = self.told.borrow_mut();
        // The head first: the speakers' loudness is set from where it is as they're placed.
        if told.head != Some(head) && head.is_sound() {
            told.head = Some(head);
            let message = serde_json::to_string(&Cab::Head { head }).unwrap_or_default();
            told.messages[1] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        if told.speakers.as_ref().map(Option::as_deref) != Some(speakers) {
            let speakers = speakers.map(<[_]>::to_vec);
            told.speakers = Some(speakers.clone());
            let message = serde_json::to_string(&Cab::Speakers { speakers }).unwrap_or_default();
            told.messages[0] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        let camera = (outside, if outside { (distance * 4.0).round() / 4.0 } else { 0.0 });
        if told.camera != Some(camera) && camera.1.is_finite() {
            told.camera = Some(camera);
            let message = serde_json::to_string(&Cab::Outside { on: camera.0, distance: camera.1 }).unwrap_or_default();
            told.messages[2] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        if told.equalizer != Some(equalizer) {
            told.equalizer = Some(equalizer);
            let message = serde_json::to_string(&Cab::Equalizer { equalizer }).unwrap_or_default();
            told.messages[3] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        if told.spectrum != Some(spectrum) {
            told.spectrum = Some(spectrum);
            let message = serde_json::to_string(&Cab::Spectrum { on: spectrum }).unwrap_or_default();
            told.messages[4] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        Ok(())
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
            Command::Stop => {
                let _ = self.view.show(false);
                self.pass(command)
            }
            Command::Play { kind: Some(MediaKind::Audio), .. } => {
                let _ = self.view.show(false);
                self.pass(&command.checked())
            }
            other => self.pass(&other.checked()),
        }
    }

    fn pass(&self, command: &Command) -> windows::core::Result<()> {
        self.view.post_json(&serde_json::to_string(command).unwrap_or_default())
    }

    /// What the page said since the last call.
    pub fn take_reports(&self) -> Vec<Report> {
        let mut reports = Vec::new();
        for message in self.view.take_page_messages() {
            if let Some(bars) = speakers::read_spectrum(&message) {
                reports.push(Report::Spectrum(bars));
                continue;
            }
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&message) else { continue };
            if value.get("ready").and_then(serde_json::Value::as_bool) == Some(true) {
                // A page loaded anew: the cab as it is.
                for told in self.told.borrow().messages.iter().flatten() {
                    let _ = self.view.post_json(told);
                }
            } else if let Some(playback) = value.get("playback") {
                let playback = serde_json::from_value::<Playback>(playback.clone()).ok().map(Box::new);
                reports.push(Report::Playback(playback));
            }
        }
        reports
    }

    /// Whether the WebView failed since the last call (it's then closed and started again when needed).
    pub fn failed(&self) -> bool {
        self.view.take_failure().is_some()
    }

    /// Takes the WebView off the frame; it closes as it's dropped.
    pub fn close(self, stage: &Stage) {
        let _ = stage.remove(&self.view);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plays_the_kinds_the_browser_plays_in_any_case() {
        assert!(plays_audio("Night Drive.mp3"));
        assert!(plays_audio("road.OGG"));
        assert!(plays_audio("live.flac"));
        assert!(!plays_audio("clip.mp4"));
        assert!(!plays_audio("cover.jpg"));
        assert!(!plays_audio("readme"));
        assert!(!plays_audio("song.wma"));

        assert!(plays_video("Highway.mp4"));
        assert!(plays_video("dashcam.WEBM"));
        assert!(plays_video("movie.Mkv"));
        assert!(plays_video("trip.mov"));
        assert!(!plays_video("Night Drive.mp3"));
        assert!(!plays_video("notes.txt"));
    }

    #[test]
    fn lists_names_as_explorer_does() {
        let mut names = vec!["10 b.mp3", "2 a.mp3", "B.mp3", "a.mp3", "1 c.mp3"];
        names.sort_by(|a, b| natural(a, b));
        assert_eq!(names, ["1 c.mp3", "2 a.mp3", "10 b.mp3", "a.mp3", "B.mp3"]);
    }

    #[test]
    fn reads_the_cabin_pages_commands_and_lets_only_names_through() {
        let play: Command = serde_json::from_str(
            r#"{"action":"play","files":["a.mp4","..\\x.mp4","b.webm"],"index":1,"kind":"video"}"#,
        )
        .unwrap();
        assert_eq!(
            play.checked(),
            Command::Play {
                files: Some(vec!["a.mp4".into(), "b.webm".into()]),
                index: Some(1),
                shuffle: None,
                kind: Some(MediaKind::Video),
            }
        );
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"play"}"#).unwrap(),
            Command::Play { files: None, index: None, shuffle: None, kind: None }
        );
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"repeat","mode":"one"}"#).unwrap(),
            Command::Repeat { mode: Repeat::One }
        );
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"show","x":10,"y":20,"width":640,"height":360,"crop":true}"#)
                .unwrap(),
            Command::Show { x: 10.0, y: 20.0, width: 640, height: 360, crop: true }
        );
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"hide"}"#).unwrap(), Command::Hide);
        assert_eq!(serde_json::from_str::<Command>(r#"{"action":"rate","rate":1.5}"#).unwrap(), Command::Rate { rate: 1.5 });
        assert!(!is_name("C:x.mp3") && !is_name("..") && !is_name("a/b.mp3") && is_name("a.b.mp3"));
    }

    #[test]
    fn parses_http_byte_ranges_and_percent_encoding() {
        assert_eq!(parse_range("bytes=0-", 100), Ok((0, 99)));
        assert_eq!(parse_range("bytes=10-20", 100), Ok((10, 20)));
        assert_eq!(parse_range("bytes=90-999", 100), Ok((90, 99)));
        assert_eq!(parse_range("bytes=-25", 100), Ok((75, 99)));
        assert_eq!(parse_range("bytes=-500", 100), Ok((0, 99)));
        assert_eq!(parse_range("bytes=100-", 100), Err(()));
        assert_eq!(parse_range("bytes=50-40", 100), Err(()));
        assert_eq!(parse_range("bytes=0-1,2-3", 100), Err(()));
        assert_eq!(parse_range("bytes=0-", 0), Err(()));

        assert_eq!(percent_decode("Night%20Drive.mp4").as_deref(), Some("Night Drive.mp4"));
        assert_eq!(percent_decode("%E8%A7%86%E9%A2%91.mp4").as_deref(), Some("视频.mp4"));
        assert_eq!(percent_decode("bad%2"), None);
    }

    #[test]
    fn lists_music_and_videos_folders_separately() {
        let dir = std::env::temp_dir().join(format!("westplay-media-folders-{}", std::process::id()));
        let covers = dir.join("covers");
        let music = dir.join("music");
        let videos = dir.join("videos");
        std::fs::create_dir_all(&music).unwrap();
        std::fs::create_dir_all(&videos).unwrap();
        std::fs::write(music.join("2 Second.mp3"), b"not really a song").unwrap();
        std::fs::write(music.join("10 Tenth.ogg"), b"nor this").unwrap();
        std::fs::write(music.join("ignore.mp4"), b"video in music").unwrap();
        std::fs::write(videos.join("1 Intro.mp4"), b"not really a video").unwrap();
        std::fs::write(videos.join("10 Road.webm"), b"nor this").unwrap();
        std::fs::write(videos.join("ignore.mp3"), b"audio in videos").unwrap();
        let (songs, video_items) = read_all(Some(&music), Some(&videos), &covers);
        let song_files: Vec<_> = songs.iter().map(|s| s.file.as_str()).collect();
        let video_files: Vec<_> = video_items.iter().map(|v| v.file.as_str()).collect();
        assert_eq!(song_files, ["2 Second.mp3", "10 Tenth.ogg"]);
        assert_eq!(video_files, ["1 Intro.mp4", "10 Road.webm"]);
        assert!(songs.iter().all(|s| s.kind == MediaKind::Audio));
        assert!(video_items.iter().all(|v| v.kind == MediaKind::Video));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn says_where_the_folders_are_and_their_media() {
        let song = Song {
            file: "a.mp3".into(),
            kind: MediaKind::Audio,
            title: Some("A".into()),
            artist: None,
            seconds: 12.5,
            cover: None,
        };
        let video = Song {
            file: "v.mp4".into(),
            kind: MediaKind::Video,
            title: None,
            artist: None,
            seconds: 60.0,
            cover: None,
        };
        let message: serde_json::Value =
            serde_json::from_str(&folder_message(Some(Path::new("music")), Some(Path::new("videos")), &[song], &[video]))
                .unwrap();
        assert_eq!(message["type"], "musicFolder");
        assert_eq!(message["folder"], "music");
        assert_eq!(message["videosFolder"], "videos");
        assert_eq!(
            message["songs"][0],
            serde_json::json!({ "file": "a.mp3", "kind": "audio", "title": "A", "seconds": 12.5 })
        );
        assert_eq!(
            message["videos"][0],
            serde_json::json!({ "file": "v.mp4", "kind": "video", "seconds": 60.0 })
        );
    }
}
