//! Maps generated from the player's game, DLCs and active mods, with one cache namespace per
//! installation, map and ordered mount stack. The host decides which profiles to maintain.
//!
//! Package metadata in `map.json`'s `source` is an invalidation hint. The versioned dependency record
//! captures effective virtual filesystem queries, so unrelated changes and repackaging can be
//! validated without full generation. Semantic inputs include language, builder and ATS DLC guards.
//!
//! Generation runs only while the game is closed. New resources and their dependency record are
//! committed by replacing the manifest last, retaining the previous map on cancellation or failure.
//! A map is only ever built while the game is closed: building the whole map takes several gigabytes of
//! memory (its peak private bytes 5.19 GB for the base map with every DLC, 7.15 GB for ProMods 2.84: map_check,
//! 2026-11-11), which a PC running the game may not have to spare. A build under way ends when the game starts
//! (host/maps.rs).
//! Players run WestPlay first, for its first setup, then the game; a map to build again (the game updated, a
//! map mod changed) waits until the game is closed, the cab keeping the map it has meanwhile.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde_json::json;
use westplay_mapdata::archive::Archive;
use westplay_mapdata::export::{self, ExportError, Options, Progress, Summary};
use westplay_mapdata::files::{FileError, GameFiles, Mount};
use westplay_mapdata::world::MapError;

use crate::game::{self, Game};
use crate::profiles::{Mod, Profile};

/// How WestPlay builds maps: raise it when a map built before is no longer what it would build now. 2 (1.2):
/// map mods mounted in the game's order (they had been the wrong way round), ProMods' hidden archives,
/// nodes two map mods share, filling stations two fuel companies stand by. 3 (after 1.2.0): the road graph
/// for WestPlay's own routes (route-graph.bin beside the tiles). 4 (after 1.2.0): rest areas marked only by
/// their triggers, made of roads and models rather than a rest area's prefab. 5 (after 1.2.0): which country
/// each part of the map is in and their time zones (countries.json beside the tiles), for the cab's clock. 6
/// (after 1.2.0): the countries' squares without a road filled with the nearest's (the page only looks up). 7
/// (after 1.2.0): the road graph marks the game's invisible roads (border crossings' and toll plazas' lanes),
/// never a waypoint's place, and leaves out roads no vehicle may drive (`traffic_lane.no_vehicles` only). 8
/// (after 1.2.0): the buildings, raised (the tiles' `building` layer: buildings.rs). 9 (after 1.2.0): their
/// shapes traced from their models (outlines, heights, roofs over open ground), not their boxes. 10 (after
/// 1.2.0): the places' own buildings, from their prefabs' models (filling stations, garages, depots…). 11
/// (after 1.2.0): the buildings structure sets' walls close round, their roofs' details no longer on the ground.
/// 12 (after 1.2.0): a place's prefab the map gives no roads draws none (a filling station's forecourt lanes
/// were a white blob). 13 (after 1.2.0): it draws its way through again, as wide as the roads meeting it (12
/// left the roads into such stations stopping short), none where nothing joins it; `blke_40`'s roads on their lane.
/// 14 (after 1.2.0): the tunnels, the roads' `tunnel` (area.rs mark_tunnels). 15 (after 2.0.3): map mods read
/// that were left out (sectors of 895, environment areas before 901, emptied directories in protected
/// archives) and older mods' prefabs (from version 22, skipped before); only a map that left a mod out is
/// built again for it ([`LEFT_OUT_ONLY`]). 16 to 25 were builders since scrapped, so local maps may carry them, and
/// nothing was built by 26. 27 (after 2.1.4): the new drawing (surface/): roads and junctions as exact surfaces in tiles of
/// their own. 29 (after 2.1.4; nothing was built by 28): service areas' ground (the tiles' `service` layer), private roads
/// back in the road graph, only to reach or leave what's on them (a route never goes through one), and each place's node
/// chosen by what a route gets to, through a service area to the far end of the lane past the place (access.rs).
/// 31 (after 2.1.4; nothing was built by 30): road lines for what the game leaves off its map too, and no-entry signs at
/// those roads' entrances (no_entry.rs). 33 (after 2.1.4; nothing was built by 32): the roads at their real heights
/// (surface/raised.rs). 35 (after 2.1.4; nothing was built by 34): only intersections and bridges rise. 36: grass and
/// yards round a road aren't road, a road's height goes evenly along each piece, and junctions in tunnels are tunnels.
/// 37: the flat map's copy of a raised road goes by its file, for the cab to take off the map; a filling station along a
/// two-way road has only that road. 39 (nothing was built by 38): a bridge over open water that comes down to its ends
/// stands as high as it is over the water. 41 (nothing was built by 40): the buildings in their real shapes, their
/// models' own triangles (crates/mapdata meshes.rs), and ATS's landmarks (landmarks.rs). 42: ATS's sea held to the
/// game's own picture of its world and that picture drawn beyond the map (crates/mapdata world_picture.rs), not its
/// edges carried straight out. 43: ATS's map only as the player's game has it, its map DLCs' states (crates/mapdata
/// dlc.rs). 44 (2.2.1): ATS's map starts at San Francisco (it started in empty desert), and every map is prepared
/// again with the surfaces' lower memory (the maps alike, byte for byte): owner 2026-11-04, "everyone should get SF",
/// and the maps prepared again with the update.
/// 45: resolve actual model/material overrides from the full active mod stack and read older PMD/PMG layouts.
/// 46: upstream 2.4.0's damaged-mod tolerance, dependency manifests and indexed sea tiles.
/// 47: fixed speed cameras extracted from hookup locators (speed_cameras.json).
pub const BUILDER_VERSION: u32 = 47;
/// The builders whose change reached only maps that left a mod out (15: mods read that were left out before): a map that
/// left none out, built by a builder since which there were only these, is as today's, and is kept (a mod's old prefabs
/// it skipped are drawn once it's built again for another reason). Every other builder builds every map again. (Until
/// 2026-11-11 it was the oldest builder whose maps were today's but for those, to be moved up with every builder that
/// changed every map; left at 40, it kept maps built by 41 to 43 that left nothing out through 42, 43 and 44.)
const LEFT_OUT_ONLY: &[u32] = &[15];

/// The folder of the map `profile` plays, in `maps` (WestPlay's maps folder): one per map and its map mods.
pub fn folder(maps: &Path, profile: &Profile) -> PathBuf {
    let mods: Vec<&str> = profile.map_mods().map(|m| m.package.as_str()).collect();
    maps.join(format!("{}-{:016x}", profile.map, fnv1a(mods.join("\n").as_bytes())))
}

/// A cache namespace includes the installation, so two games/installations cannot overwrite each other.
pub fn folder_for(maps: &Path, game: &Game, profile: &Profile) -> PathBuf {
    let mods: Vec<&str> = profile.mods.iter().map(|m| m.package.as_str()).collect();
    maps.join(format!(
        "{}-{:016x}",
        profile.map,
        fnv1a(format!("{:?}\n{}\n{}", game.kind, normal_path(&game.dir), mods.join("\n")).as_bytes())
    ))
}

/// What the map `profile` plays would be built from now.
pub fn source(game: &Game, profile: &Profile, language: Option<&str>) -> serde_json::Value {
    let mods: Vec<_> = profile
        .mods
        .iter()
        .map(|m| {
            let (size, modified) = m.files.as_deref().map(stamp).unwrap_or((0, 0));
            json!({ "package": m.package, "size": size, "modified": modified })
        })
        .collect();
    json!({
        "builder": BUILDER_VERSION,
        "kind": game.kind,
        "installation": normal_path(&game.dir),
        "inputs": input_stamp(game, profile),
        "profileWritten": profile_stamp(&profile.dir),
        "game": game.version.map(|version| version.to_string()),
        "dlcs": game.dlcs,
        "map": profile.map,
        "mods": mods,
        "language": language,
    })
}

/// Windows paths are case insensitive; profile names and cache folders are not identities.
pub fn normal_path(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/").to_lowercase();
    let raw = raw.strip_prefix("//?/").unwrap_or(&raw);
    let prefix = if raw.starts_with("//") {
        "//"
    } else if raw.starts_with('/') {
        "/"
    } else {
        ""
    };
    let mut parts = Vec::new();
    for part in raw.split('/') {
        match part {
            "" | "." => {}
            ".." if parts.last().is_some_and(|p: &&str| !p.ends_with(':') && *p != "..") => {
                parts.pop();
            }
            _ => parts.push(part),
        }
    }
    format!("{prefix}{}", parts.join("/"))
}
pub fn target(kind: game::Kind, dir: &Path, truckersmp: bool, promods: bool) -> String {
    format!(
        "{}:{}{}",
        match kind {
            game::Kind::Ets2 => "ets2",
            game::Kind::Ats => "ats",
        },
        normal_path(dir),
        if truckersmp { if promods { "#truckersmp-promods" } else { "#truckersmp" } } else { "" }
    )
}
pub fn profile_stamp(dir: &Path) -> serde_json::Value {
    json!(
        std::fs::metadata(dir.join("profile.sii"))
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|t| t.as_nanos().to_string())
    )
}
pub fn input_stamp(game: &Game, profile: &Profile) -> String {
    let mut paths: Vec<PathBuf> = std::fs::read_dir(&game.dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "scs"))
        .collect();
    paths.sort();
    paths.push(game.dir.join(game.kind.executable()));
    paths.extend(profile.mods.iter().filter_map(|m| m.files.clone()));
    westplay_mapdata::dependencies::input_stamp(&paths)
}
pub fn semantic_source(game: &Game, profile: &Profile, language: Option<&str>) -> serde_json::Value {
    let guards = if game.kind == game::Kind::Ats {
        std::fs::read(game.dir.join(game.kind.executable()))
            .ok()
            .and_then(|exe| westplay_mapdata::dlc::read_guards(&exe))
    } else {
        None
    };
    json!({ "builder": BUILDER_VERSION, "kind": game.kind, "map": profile.map, "language": language, "guards": guards })
}

#[derive(Clone, Debug, PartialEq)]
pub enum CacheCheck {
    Current,
    Missing,
    Unverified,
    Changed(String),
}

/// Checks the effective virtual file contents. Version numbers and packaging do not decide freshness.
pub fn check_cache(
    folder: &Path,
    game: &Game,
    profile: &Profile,
    language: Option<&str>,
) -> Result<CacheCheck, BuildError> {
    check_cache_controlled(folder, game, profile, language, false, None)
}
pub fn check_cache_controlled(
    folder: &Path,
    game: &Game,
    profile: &Profile,
    language: Option<&str>,
    allow_cache: bool,
    stop: Option<&std::sync::atomic::AtomicBool>,
) -> Result<CacheCheck, BuildError> {
    let Ok(bytes) = std::fs::read(folder.join("map.json")) else { return Ok(CacheCheck::Missing) };
    let Ok(manifest) = serde_json::from_slice::<serde_json::Value>(&bytes) else { return Ok(CacheCheck::Unverified) };
    let Some(value) = manifest.get("dependencies") else { return Ok(CacheCheck::Unverified) };
    let Ok(deps) = serde_json::from_value::<westplay_mapdata::dependencies::Dependencies>(value.clone()) else {
        return Ok(CacheCheck::Unverified);
    };
    if deps.version != westplay_mapdata::dependencies::VERSION || !deps.stable || deps.queries.is_empty() {
        return Ok(CacheCheck::Unverified);
    }
    let before = input_stamp(game, profile);
    let profile_before = profile_stamp(&profile.dir);
    if manifest["source"]["semantic"] != semantic_source(game, profile, language) {
        return Ok(CacheCheck::Changed("mapContextChanged".into()));
    }
    // Omitted packages belong to this same atomic manifest. Retry only if their state changes.
    let omitted = manifest["source"]["omitted"].as_array();
    let mut skipped = Vec::new();
    if let Some(omitted) = omitted {
        for entry in omitted {
            let item = profile.mods.iter().find(|m| Some(m.package.as_str()) == entry["package"].as_str());
            let Some(item) = item else {
                return Ok(CacheCheck::Changed("omittedModChanged".into()));
            };
            if entry["stamp"] != omitted_mod_stamp(item) {
                return Ok(CacheCheck::Changed("omittedModChanged".into()));
            }
            skipped.extend(item.files.clone());
        }
    } else if !left_out(folder).is_empty() {
        return Ok(CacheCheck::Changed("omittedModChanged".into()));
    }
    if deps.unreadable {
        return Ok(CacheCheck::Unverified);
    }
    let files = mount_without(game, profile, &skipped)?;
    let equal = files.verify_dependencies_cached(&deps, allow_cache, stop)?;
    if before != input_stamp(game, profile) || profile_before != profile_stamp(&profile.dir) {
        return Ok(CacheCheck::Changed("inputsChangedDuringCheck".into()));
    }
    Ok(if !equal {
        CacheCheck::Changed("mapDependenciesChanged".into())
    } else if omitted.is_some_and(|items| !items.is_empty()) {
        CacheCheck::Unverified
    } else {
        CacheCheck::Current
    })
}

/// Include missing active packages in the same conservative state check as unreadable ones.
fn omitted_mod_stamp(item: &Mod) -> String {
    item.files.as_ref().map_or_else(
        || "missing".into(),
        |path| westplay_mapdata::dependencies::input_stamp(std::slice::from_ref(path)),
    )
}

/// Whether the map in `folder` isn't (yet) what `source` would build ([`same_source`]).
pub fn needs_building(folder: &Path, source: &serde_json::Value) -> bool {
    let Some(built) = export::built_from(folder) else { return true };
    if same_source(&built, source) {
        return false;
    }
    // Built by a builder since which only maps that left a mod out differ, and it left none: as today's.
    let builder = built["builder"].as_u64().unwrap_or(0);
    if same_but_left_out(builder, BUILDER_VERSION, LEFT_OUT_ONLY) && left_out(folder).is_empty() {
        let mut as_now = built;
        as_now["builder"] = json!(BUILDER_VERSION);
        return !same_source(&as_now, source);
    }
    true
}

/// Whether a map built from `built` is what `source` would build: the same in everything, the game's version only by
/// its release (1.62 of 1.62.3.2). A hotfix of the game (1.62.3.2 to 1.62.3.3) prepares no map again: every player's
/// maps were prepared again at once, and a mod map's could take most of an hour (owner 2026-11-13: only a release, as
/// 1.63, prepares them again). The record keeps the whole version, for the log.
pub fn same_source(built: &serde_json::Value, source: &serde_json::Value) -> bool {
    release_only(built) == release_only(source)
}

/// `source` with its game's version cut to the release: its first two numbers.
fn release_only(source: &serde_json::Value) -> serde_json::Value {
    let mut source = source.clone();
    if let Some(version) = source["game"].as_str() {
        let release: Vec<&str> = version.split('.').take(2).collect();
        source["game"] = json!(release.join("."));
    }
    source
}

/// Whether a map built by `builder` is as one built by `today` but for the mods it left out: older, and every builder
/// since one of `only` ([`LEFT_OUT_ONLY`]).
fn same_but_left_out(builder: u64, today: u32, only: &[u32]) -> bool {
    builder < u64::from(today)
        && (builder + 1..=u64::from(today)).all(|since| only.iter().any(|&o| u64::from(o) == since))
}

/// The game mounted with the profile's map mods over it, in its load order: the profile lists its mods from
/// the bottom of the game's Mod Manager up (checked 2026-10-19 against a profile's Mod Manager), the top one
/// overriding those below, so they mount as listed, each over those before.
pub fn mount(game: &Game, profile: &Profile) -> Result<GameFiles, FileError> {
    mount_without(game, profile, &[])
}

/// [`mount`], leaving out the mods whose files are `left_out`.
fn mount_without(game: &Game, profile: &Profile, left_out: &[PathBuf]) -> Result<GameFiles, FileError> {
    let mut files = GameFiles::install(&game.dir)?;
    for m in &profile.mods {
        if m.files.as_ref().is_some_and(|path| left_out.contains(path)) {
            continue;
        }
        if let Some(mount) = open(m)? {
            files.mount(mount);
        }
    }
    Ok(files)
}

fn open(m: &Mod) -> Result<Option<Mount>, FileError> {
    let Some(path) = m.files.as_deref() else { return Ok(None) };
    if path.is_dir() {
        return Ok(Some(Mount::Folder(path.to_path_buf())));
    }
    Archive::open(path).map(|archive| Some(Mount::Archive(archive))).map_err(|error| FileError {
        path: String::new(),
        mount: path.to_path_buf(),
        error,
    })
}

/// Why a map wasn't built.
#[derive(Debug)]
pub enum BuildError {
    /// The game is running: maps are built while it's closed.
    GameRunning,
    Export(ExportError),
}

impl std::fmt::Display for BuildError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::GameRunning => write!(f, "the game is running: the map is built once it's closed"),
            Self::Export(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for BuildError {}

impl From<ExportError> for BuildError {
    fn from(error: ExportError) -> Self {
        Self::Export(error)
    }
}

impl From<FileError> for BuildError {
    fn from(error: FileError) -> Self {
        Self::Export(ExportError::Files(error))
    }
}

/// A map built: its folder, what it holds, and the map mods left out of it.
pub struct Built {
    pub folder: PathBuf,
    pub summary: Summary,
    pub left_out: Vec<LeftOut>,
}

/// A map mod left out of a profile's map: its files couldn't be read (a damaged archive, or one protected in a
/// way WestPlay can't read), so the map was built from the rest.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct LeftOut {
    /// As the Mod Manager names it.
    pub name: String,
    /// What couldn't be read, and why.
    pub error: String,
}

/// Where a map built before its manifest held them kept the mods left out of it (none: no file).
const LEFT_OUT_FILE: &str = "left-out.json";

/// The map mods left out of the map built in `folder`: its manifest's `leftOut`, or (a map built before that) its
/// `left-out.json`.
pub fn left_out(folder: &Path) -> Vec<LeftOut> {
    if let Some(source) = export::built_from(folder)
        && let Some(value) = source.get("leftOut")
    {
        return serde_json::from_value(value.clone()).unwrap_or_default();
    }
    let read = |path: PathBuf| {
        std::fs::read(path).ok().and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
    };
    if let Some(left) = read(folder.join("map.json")).and_then(|manifest| manifest.get("leftOut").cloned()) {
        return serde_json::from_value(left).unwrap_or_default();
    }
    read(folder.join(LEFT_OUT_FILE)).and_then(|left| serde_json::from_value(left).ok()).unwrap_or_default()
}

/// Builds the map `profile` plays into its folder in `maps`, telling `progress`; not while the game runs.
/// A map mod whose files can't be read is left out and the map built from the rest (and from the start
/// again: `progress` goes back), rather than none built: the game itself reads what it can.
pub fn build(
    game: &Game,
    profile: &Profile,
    language: Option<&str>,
    maps: &Path,
    stop: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    progress: &mut dyn FnMut(Progress),
) -> Result<Built, BuildError> {
    build_controlled(game, profile, language, maps, stop, None, progress)
}

pub fn build_controlled(
    game: &Game,
    profile: &Profile,
    language: Option<&str>,
    maps: &Path,
    stop: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    commit_file: Option<PathBuf>,
    progress: &mut dyn FnMut(Progress),
) -> Result<Built, BuildError> {
    if game::running() {
        return Err(BuildError::GameRunning);
    }
    let out = folder_for(maps, game, profile);
    let initial = input_stamp(game, profile);
    let initial_profile = profile_stamp(&profile.dir);
    let mut options = Options {
        map: profile.map.clone(),
        language: language.map(str::to_owned),
        around: None,
        source: Some({
            let mut source = source(game, profile, language);
            source["semantic"] = semantic_source(game, profile, language);
            source
        }),
        stop,
        commit_file,
        external_inputs: std::iter::once(game.dir.clone())
            .chain(std::iter::once(profile.dir.join("profile.sii")))
            .chain(profile.mods.iter().filter_map(|m| m.files.clone()))
            .collect(),
        game_zone: Some(game.kind.sdk_time_zone()),
        sea_by_nearest: game.kind == game::Kind::Ats,
        // ATS's map holds every state, each guarded by its DLC: drawn only as the player's game has it (its guards'
        // list read from its executable; unread, the map drawn whole and the host says so).
        dlc_guards: (game.kind == game::Kind::Ats)
            .then(|| std::fs::read(game.dir.join(game.kind.executable())).ok())
            .flatten()
            .and_then(|exe| westplay_mapdata::dlc::read_guards(&exe)),
        left_out: None,
        water_held: false,
    };
    let mut skipped: Vec<PathBuf> = Vec::new();
    let mut left_out: Vec<LeftOut> = profile
        .mods
        .iter()
        .filter(|m| m.files.is_none())
        .map(|m| LeftOut {
            name: m.name.clone(),
            error: m.problem.clone().unwrap_or_else(|| "mod files unavailable".into()),
        })
        .collect();
    loop {
        if let Some(source) = options.source.as_mut() {
            source["leftOut"] =
                serde_json::to_value(&left_out).map_err(std::io::Error::other).map_err(ExportError::Io)?;
            source["omitted"] = serde_json::Value::Array(
                profile
                    .mods
                    .iter()
                    .filter(|m| m.files.is_none() || m.files.as_ref().is_some_and(|p| skipped.contains(p)))
                    .map(|item| json!({ "package": item.package, "stamp": omitted_mod_stamp(item) }))
                    .collect(),
            );
        }
        options.left_out = Some(serde_json::to_value(&left_out).map_err(|error| ExportError::Io(error.into()))?);
        let built = mount_without(game, profile, &skipped).map_err(BuildError::from).and_then(|files| {
            if initial != input_stamp(game, profile) || initial_profile != profile_stamp(&profile.dir) {
                return Err(ExportError::InputsChanged.into());
            }
            files.track_dependencies();
            Ok(export::export(&files, &options, &out, progress)?)
        });
        let error = match built {
            Ok(summary) => {
                // The file an older build kept them in, no longer read (the manifest's are): let go.
                let _ = std::fs::remove_file(out.join(LEFT_OUT_FILE));
                return Ok(Built { folder: out, summary, left_out });
            }
            Err(error) => error,
        };
        let culprit = unread_mod(&error, profile).filter(|m| m.files.as_ref().is_some_and(|f| !skipped.contains(f)));
        let Some(m) = culprit else { return Err(error) };
        left_out.push(LeftOut { name: m.name.clone(), error: error.to_string() });
        skipped.extend(m.files.clone());
    }
}

/// The profile's map mod whose files a build failed to read, if that's why it failed (never the game's own:
/// a game that can't be read has no map without it).
fn unread_mod<'a>(error: &BuildError, profile: &'a Profile) -> Option<&'a Mod> {
    let from = match error {
        BuildError::Export(ExportError::Files(error) | ExportError::Map(MapError::File(error))) => &error.mount,
        BuildError::Export(ExportError::Map(MapError::Sector { from: Some(from), .. })) => from,
        _ => return None,
    };
    profile.mods.iter().find(|m| m.files.as_deref() == Some(from.as_path()))
}

/// A file's (or folder's) size and when it was last changed (seconds since 1970), to tell a mod updated.
///
/// A folder's: all its files' sizes together, and the newest time of them and its folders. (The folder's own was
/// taken: its size 0 on Windows, its time changed only by what's in it directly, so a file changed deeper in a
/// folder mod never built its map again: the review of 2026-11-11, minor 27.)
fn stamp(path: &Path) -> (u64, u64) {
    let seconds = |metadata: &std::fs::Metadata| {
        let since = metadata.modified().ok().and_then(|time| time.duration_since(UNIX_EPOCH).ok());
        since.map_or(0, |since| since.as_secs())
    };
    let Ok(metadata) = std::fs::metadata(path) else { return (0, 0) };
    if !metadata.is_dir() {
        return (metadata.len(), seconds(&metadata));
    }
    let (mut size, mut newest) = (0u64, seconds(&metadata));
    let mut folders = vec![path.to_path_buf()];
    while let Some(folder) = folders.pop() {
        for entry in std::fs::read_dir(&folder).into_iter().flatten().flatten() {
            let Ok(metadata) = entry.metadata() else { continue };
            newest = newest.max(seconds(&metadata));
            if metadata.is_dir() {
                folders.push(entry.path());
            } else {
                size += metadata.len();
            }
        }
    }
    (size, newest)
}

/// FNV-1a, 64 bits: a short, stable name for a combination of mods.
fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, &byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::{FoundBy, Kind, Version};
    use crate::profiles::MapContent;

    fn a_mod(package: &str, sectors: &[&str], definitions: bool) -> Mod {
        Mod {
            package: package.into(),
            name: package.into(),
            files: None,
            categories: vec![],
            author: None,
            map: MapContent { sectors: sectors.iter().map(|s| (*s).to_owned()).collect(), definitions, hidden: false },
            problem: None,
        }
    }

    fn profile(map: &str, mods: Vec<Mod>) -> Profile {
        Profile { name: "P".into(), dir: PathBuf::new(), cloud: false, last_saved: None, map: map.into(), mods }
    }

    fn game() -> Game {
        Game {
            kind: Kind::Ets2,
            dir: PathBuf::new(),
            found_by: FoundBy::Steam,
            version: Some(Version([1, 61, 1, 9])),
            dlcs: vec!["dlc_east".into()],
        }
    }

    #[test]
    fn mounts_the_mod_managers_top_over_those_below() {
        // Two mods with the same file; the profile lists them from the Mod Manager's bottom up, as Eren's lists
        // ProMods' Definition Package last and the Mod Manager shows it at the top.
        let root = std::env::temp_dir().join(format!("westplay-mount-{}", std::process::id()));
        let with_city = |name: &str| {
            let dir = root.join(name);
            std::fs::create_dir_all(dir.join("def")).unwrap();
            std::fs::write(dir.join("def").join("city.sii"), name).unwrap();
            dir
        };
        let as_mod = |name: &str| Mod { files: Some(with_city(name)), ..a_mod(name, &[], true) };
        let (below, top) = (as_mod("below"), as_mod("top"));
        let game = Game { dir: root.join("game"), ..game() };
        std::fs::create_dir_all(&game.dir).unwrap();
        let files = mount(&game, &profile("europe", vec![below.clone(), top.clone()])).unwrap();
        assert_eq!(files.read("/def/city.sii").unwrap().unwrap(), b"top");
        // The other way round in the Mod Manager: the other one.
        let files = mount(&game, &profile("europe", vec![top, below])).unwrap();
        assert_eq!(files.read("/def/city.sii").unwrap().unwrap(), b"below");
        let _ = std::fs::remove_dir_all(&root);
    }

    /// A folder mod's stamp changes when a file deep in it does (its size, then its time).
    #[test]
    fn a_folder_mods_stamp_changes_with_a_file_deep_in_it() {
        let dir = std::env::temp_dir().join(format!("westplay-stamp-{}", std::process::id()));
        let deep = dir.join("map").join("europe");
        std::fs::create_dir_all(&deep).unwrap();
        std::fs::write(deep.join("sec+0000+0000.base"), b"12345").unwrap();
        std::fs::write(dir.join("manifest.sii"), b"ab").unwrap();
        let first = stamp(&dir);
        assert_eq!(first.0, 7, "every file's size");
        std::fs::write(deep.join("sec+0000+0000.base"), b"1234567").unwrap();
        assert_eq!(stamp(&dir).0, 9);
        // The same size, later: its time.
        let file = std::fs::File::options().write(true).open(deep.join("sec+0000+0000.base")).unwrap();
        file.set_modified(std::time::SystemTime::now() + std::time::Duration::from_secs(120)).unwrap();
        drop(file);
        assert!(stamp(&dir).1 > first.1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_mods_left_out_are_the_manifests_or_an_older_maps_file() {
        let dir = std::env::temp_dir().join(format!("westplay-left-out-read-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let left = vec![LeftOut { name: "broken".into(), error: "a damaged archive".into() }];
        let write = |name: &str, value: serde_json::Value| std::fs::write(dir.join(name), value.to_string()).unwrap();
        // A map built since: its manifest's.
        write("map.json", json!({ "source": null, "leftOut": left }));
        assert_eq!(left_out(&dir), left);
        // Its manifest's, whatever an older build's file says (it isn't read any more).
        write(LEFT_OUT_FILE, json!([{ "name": "other", "error": "e" }]));
        assert_eq!(left_out(&dir), left);
        write("map.json", json!({ "source": null, "leftOut": [] }));
        assert!(left_out(&dir).is_empty());
        // A map built before: its file's.
        write("map.json", json!({ "source": null }));
        assert_eq!(left_out(&dir)[0].name, "other");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_mod_that_cant_be_read_is_named_and_left_out() {
        // A good mod, and a "mod" whose archive is damaged.
        let root = std::env::temp_dir().join(format!("westplay-left-out-{}", std::process::id()));
        let good = root.join("good");
        std::fs::create_dir_all(good.join("def")).unwrap();
        std::fs::write(good.join("def").join("city.sii"), b"good").unwrap();
        let broken = root.join("broken.scs");
        std::fs::write(&broken, b"SCS#not really an archive").unwrap();
        let game = Game { dir: root.join("game"), ..game() };
        std::fs::create_dir_all(&game.dir).unwrap();
        let mods = vec![
            Mod { files: Some(good), ..a_mod("good", &[], true) },
            Mod { files: Some(broken.clone()), ..a_mod("broken", &[], true) },
        ];
        let profile = profile("europe", mods);

        // Mounted as it is, the damaged archive fails, and the failure names it.
        let error = BuildError::from(mount(&game, &profile).err().unwrap());
        assert_eq!(unread_mod(&error, &profile).map(|m| m.name.as_str()), Some("broken"));
        // Without it, the rest mounts and reads.
        let files = mount_without(&game, &profile, &[broken]).unwrap();
        assert_eq!(files.read("/def/city.sii").unwrap().unwrap(), b"good");
        // A failure that isn't a mod's file names none: nothing to leave out.
        assert!(unread_mod(&BuildError::GameRunning, &profile).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn has_a_map_for_each_combination_of_map_mods() {
        let maps = Path::new("maps");
        let truck = a_mod("truck", &[], false);
        let promods = a_mod("promods", &["europe"], true);
        let vanilla = profile("europe", vec![truck.clone()]);
        let with_promods = profile("europe", vec![truck.clone(), promods.clone()]);
        // Truck mods don't make another map.
        assert_eq!(folder(maps, &vanilla), folder(maps, &profile("europe", vec![])));
        assert_ne!(folder(maps, &vanilla), folder(maps, &with_promods));
        assert!(folder(maps, &with_promods).file_name().unwrap().to_str().unwrap().starts_with("europe-"));
        // ProMods' models and assets, their folders hidden: they may hold its junctions' models (they do), so
        // they're mounted for the map and make another map.
        let mut models = a_mod("promods-models", &[], false);
        models.map.hidden = true;
        let with_models = profile("europe", vec![truck.clone(), models, promods.clone()]);
        assert_eq!(
            with_models.map_mods().map(|m| m.package.as_str()).collect::<Vec<_>>(),
            ["promods-models", "promods"]
        );
        assert_ne!(folder(maps, &with_models), folder(maps, &with_promods));
        // A standalone map's own.
        let standalone = profile("hvtmap", vec![a_mod("rth", &["hvtmap"], true)]);
        assert!(folder(maps, &standalone).file_name().unwrap().to_str().unwrap().starts_with("hvtmap-"));
    }

    #[test]
    fn is_built_again_when_what_it_is_built_from_changes() {
        let profile = profile("europe", vec![a_mod("promods", &["europe"], true), a_mod("truck", &[], false)]);
        let source = source(&game(), &profile, Some("en_us"));
        // All active mounts are hints; actual dependency contents decide whether to regenerate.
        assert_eq!(source["mods"].as_array().unwrap().len(), 2);
        assert_eq!(source["game"], "1.61.1.9");
        // A folder with no map, or another's: built.
        let dir = std::env::temp_dir().join(format!("westplay-map-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(needs_building(&dir, &source));
        std::fs::write(dir.join("map.json"), json!({ "source": source }).to_string()).unwrap();
        assert!(!needs_building(&dir, &source));
        // A hotfix of the game: not built again; a release: built again.
        let mut hotfix = source.clone();
        hotfix["game"] = json!("1.61.1.10");
        assert!(!needs_building(&dir, &hotfix));
        let mut updated = source.clone();
        updated["game"] = json!("1.62.0.1");
        assert!(needs_building(&dir, &updated));
        // The rest as it was: a DLC added, a mod changed, another language, another builder.
        for (field, value) in
            [("dlcs", json!(["dlc_new"])), ("mods", json!([])), ("language", json!("tr_tr")), ("builder", json!(1))]
        {
            let mut changed = source.clone();
            changed[field] = value;
            assert!(needs_building(&dir, &changed), "{field}");
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_map_an_earlier_builder_made_is_built_again_unless_only_maps_that_left_a_mod_out_changed_since() {
        // As at 15, the builder that read the mods left out before: a map by 14 is today's but for those.
        assert!(same_but_left_out(14, 15, &[15]));
        // By 13 (14 changed every map), by 14 when 16 is today's, or by today's own: not.
        assert!(!same_but_left_out(13, 15, &[15]));
        assert!(!same_but_left_out(14, 16, &[15]));
        assert!(!same_but_left_out(15, 15, &[15]));
        // Today: every map by an earlier builder is built again, those by 41 to 43 that left nothing out too (they were
        // kept through 42, 43 and 44 till 2026-11-11).
        for builder in [14, 40, 41, 42, 43, u64::from(BUILDER_VERSION) - 1] {
            assert!(!same_but_left_out(builder, BUILDER_VERSION, LEFT_OUT_ONLY), "built by {builder}");
        }

        let profile = profile("europe", vec![a_mod("sud", &["europe"], true)]);
        let source = source(&game(), &profile, Some("en_us"));
        let dir = std::env::temp_dir().join(format!("westplay-map-left-out-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let built_by = |builder: u32| {
            let mut built = source.clone();
            built["builder"] = json!(builder);
            std::fs::write(dir.join("map.json"), json!({ "source": built }).to_string()).unwrap();
        };
        built_by(BUILDER_VERSION);
        assert!(!needs_building(&dir, &source));
        for builder in [41, 42, 43, BUILDER_VERSION - 1] {
            built_by(builder);
            assert!(needs_building(&dir, &source), "built by {builder}");
        }
        let _ = std::fs::remove_dir_all(dir);
    }
}

#[cfg(test)]
mod dependency_tests {
    use super::*;
    struct Fixture {
        root: PathBuf,
        game: Game,
        profile: Profile,
        cache: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let root = std::env::temp_dir().join(format!(
                "westplay-map-validation-{}-{}",
                std::process::id(),
                N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            let game = Game {
                kind: game::Kind::Ets2,
                dir: root.join("game"),
                version: Some(game::Version([1, 61, 1, 9])),
                found_by: game::FoundBy::Chosen,
                dlcs: vec![],
            };
            std::fs::create_dir_all(&game.dir).unwrap();
            let mod_dir = root.join("mod");
            std::fs::create_dir_all(mod_dir.join("def")).unwrap();
            std::fs::write(mod_dir.join("def/city.sii"), b"city").unwrap();
            let mut profile = Profile::new_player(game::Kind::Ets2);
            profile.mods.push(Mod {
                package: "test".into(),
                name: "Test".into(),
                files: Some(mod_dir),
                categories: vec![],
                author: None,
                map: crate::profiles::MapContent { definitions: true, ..Default::default() },
                problem: None,
            });
            let cache = root.join("cache");
            std::fs::create_dir_all(&cache).unwrap();
            let files = mount(&game, &profile).unwrap();
            files.track_dependencies();
            files.read("def/city.sii").unwrap();
            files.read("def/country.missing.sii").unwrap();
            files.list("def").unwrap();
            let manifest = json!({
                "source": { "semantic": semantic_source(&game, &profile, Some("en_us")) },
                "dependencies": files.dependencies(),
            });
            std::fs::write(cache.join("map.json"), manifest.to_string()).unwrap();
            Self { root, game, profile, cache }
        }
        fn check(&self) -> CacheCheck {
            check_cache(&self.cache, &self.game, &self.profile, Some("en_us")).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }
    #[test]
    fn patch_version_and_unrelated_dlc_do_not_rebuild() {
        let mut f = Fixture::new();
        assert_eq!(f.check(), CacheCheck::Current);
        f.game.version = Some(game::Version([1, 61, 1, 10]));
        f.game.dlcs.push("dlc_cosmetics".into());
        let mut empty_zip = vec![0u8; 22];
        empty_zip[..4].copy_from_slice(b"PK\x05\x06");
        std::fs::write(f.game.dir.join("dlc_cosmetics.scs"), empty_zip).unwrap();
        assert_eq!(f.check(), CacheCheck::Current);
    }
    #[test]
    fn content_and_new_missing_dependency_require_rebuild() {
        let f = Fixture::new();
        let mod_dir = f.profile.mods[0].files.as_ref().unwrap();
        std::fs::write(mod_dir.join("def/city.sii"), b"another city").unwrap();
        assert!(matches!(f.check(), CacheCheck::Changed(_)));
        std::fs::write(mod_dir.join("def/city.sii"), b"city").unwrap();
        assert_eq!(f.check(), CacheCheck::Current);
        std::fs::write(mod_dir.join("def/country.missing.sii"), b"new").unwrap();
        assert!(matches!(f.check(), CacheCheck::Changed(_)));
    }
    #[test]
    fn language_builder_and_ats_guards_are_semantic_inputs() {
        let f = Fixture::new();
        assert!(matches!(check_cache(&f.cache, &f.game, &f.profile, Some("zh_cn")).unwrap(), CacheCheck::Changed(_)));
        let mut m: serde_json::Value =
            serde_json::from_slice(&std::fs::read(f.cache.join("map.json")).unwrap()).unwrap();
        m["source"]["semantic"]["builder"] = json!(0);
        std::fs::write(f.cache.join("map.json"), m.to_string()).unwrap();
        assert!(matches!(f.check(), CacheCheck::Changed(_)));
        let mut game = f.game.clone();
        game.kind = game::Kind::Ats;
        std::fs::create_dir_all(game.dir.join(game.kind.executable()).parent().unwrap()).unwrap();
        std::fs::write(game.dir.join(game.kind.executable()), b"\0dlc_az\0dlc_ca\0").unwrap();
        let first = semantic_source(&game, &f.profile, None);
        std::fs::write(game.dir.join(game.kind.executable()), b"\0dlc_az\0dlc_ca\0dlc_tx\0").unwrap();
        assert_ne!(first, semantic_source(&game, &f.profile, None));
    }
    #[test]
    fn legacy_and_damaged_dependencies_are_not_treated_as_current() {
        let f = Fixture::new();
        std::fs::write(f.cache.join("map.json"), b"{\"source\":{}}").unwrap();
        assert_eq!(f.check(), CacheCheck::Unverified);
        std::fs::write(f.cache.join("map.json"), b"broken").unwrap();
        assert_eq!(f.check(), CacheCheck::Unverified);
        std::fs::remove_file(f.cache.join("map.json")).unwrap();
        assert_eq!(f.check(), CacheCheck::Missing);
    }
    #[test]
    fn installation_namespace_is_independent_of_game_version() {
        let mut f = Fixture::new();
        let folder = folder_for(&f.root, &f.game, &f.profile);
        f.game.version = None;
        assert_eq!(folder, folder_for(&f.root, &f.game, &f.profile));
        f.game.dir = f.root.join("other-game");
        assert_ne!(folder, folder_for(&f.root, &f.game, &f.profile));
    }
    #[test]
    fn missing_active_mods_remain_unverified_until_their_state_changes() {
        let mut f = Fixture::new();
        let mut missing = f.profile.mods[0].clone();
        missing.package = "missing".into();
        missing.files = None;
        missing.problem = Some("not found".into());
        f.profile.mods.push(missing);
        let file = f.cache.join("map.json");
        let mut manifest: serde_json::Value = serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
        manifest["source"]["omitted"] = json!([{"package":"missing","stamp":"missing"}]);
        manifest["source"]["leftOut"] = json!([{"name":"Missing","error":"not found"}]);
        std::fs::write(&file, manifest.to_string()).unwrap();
        assert_eq!(f.check(), CacheCheck::Unverified);
        assert_eq!(f.check(), CacheCheck::Unverified); // No automatic rebuild loop while absent.
        f.profile.mods[1].files = f.profile.mods[0].files.clone();
        f.profile.mods[1].problem = None;
        assert_eq!(f.check(), CacheCheck::Changed("omittedModChanged".into()));
    }

    #[test]
    fn omitted_mod_state_is_atomic_and_only_retries_when_changed() {
        let mut f = Fixture::new();
        let bad = f.root.join("bad.scs");
        std::fs::write(&bad, b"broken mod").unwrap();
        let mut skipped = f.profile.mods[0].clone();
        skipped.package = "bad".into();
        skipped.files = Some(bad.clone());
        f.profile.mods.push(skipped);
        let file = f.cache.join("map.json");
        let mut manifest: serde_json::Value = serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
        manifest["source"]["omitted"] =
            json!([{"package":"bad","stamp":westplay_mapdata::dependencies::input_stamp(std::slice::from_ref(&bad))}]);
        manifest["source"]["leftOut"] = json!([{"name":"Bad","error":"unreadable"}]);
        std::fs::write(&file, manifest.to_string()).unwrap();
        assert_eq!(f.check(), CacheCheck::Unverified);
        assert_eq!(left_out(&f.cache)[0].name, "Bad");
        std::fs::write(&bad, b"updated different package").unwrap();
        assert_eq!(f.check(), CacheCheck::Changed("omittedModChanged".into()));
    }
}
