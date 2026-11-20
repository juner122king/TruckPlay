//! Fixed speed cameras extracted from the game's `/unit/hookup/speed_camera*.sii` definitions and the
//! `.pmg` locators placed via `ROAD_SIDE` (`sign.*`) and `MODEL` (`model.*`) map items.

use std::collections::HashMap;

use serde::Serialize;

use crate::files::{FileError, GameFiles};
use crate::pmg::Pmg;
use crate::sector::{ItemData, Node};
use crate::sii;
use crate::token::string_to_token;
use crate::world::Map;

/// A speed-camera hookup locator inside a sign or model `.pmg`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CameraLocator {
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub reverse: bool,
}

/// Extracted fixed speed camera placement in game world coordinates (metres).
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct SpeedCamera {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// Facing direction in turns `[0, 1)`, where `0` is North (`-z`).
    pub heading: f32,
    /// Whether the game hookup specifies `reverse_direction: true`.
    pub reverse: bool,
}

/// Catalog of speed-camera hookups and lazy `.pmg` locator lookup for placed signs/models.
#[derive(Default)]
pub struct SpeedCameraCatalog {
    /// Hookup unit name (`"speedcam.20"`, `"speedcam.r"`, ...) → `reverse_direction`.
    hookups: HashMap<String, bool>,
    /// `sign.*` token → `.pmg` path.
    sign_paths: HashMap<u64, String>,
    /// `model.*` token (pre-filtered by path) → camera locators.
    model_cams: HashMap<u64, Vec<CameraLocator>>,
    /// Lazy cache of checked `sign_model` tokens (empty vec means checked and not a speed camera).
    sign_cache: HashMap<u64, Vec<CameraLocator>>,
}

impl SpeedCameraCatalog {
    /// Loads speed-camera hookup definitions and indexes sign/model paths without reading all sign `.pmg`s up front.
    pub fn load(files: &GameFiles) -> Result<Self, FileError> {
        let mut hookups = HashMap::new();
        for unit in sii::read_family(files, "/unit/hookup", "speed_camera")? {
            if unit.class == "speed_camera" {
                let reverse = unit.get("reverse_direction") == Some("true");
                hookups.insert(unit.name, reverse);
            }
        }
        if hookups.is_empty() {
            return Ok(Self::default());
        }

        let mut sign_paths = HashMap::new();
        for unit in sii::read_family(files, "/def/world", "sign")? {
            let Some(token) = unit.name.strip_prefix("sign.").and_then(string_to_token) else { continue };
            let Some(desc) = unit.get("model_desc") else { continue };
            if let Some(pmg) = pmg_path_of(desc) {
                sign_paths.insert(token, pmg);
            }
        }

        let mut model_cams = HashMap::new();
        for unit in sii::read_family(files, "/def/world", "model")? {
            let Some(token) = unit.name.strip_prefix("model.").and_then(string_to_token) else { continue };
            let Some(desc) = unit.get("model_desc") else { continue };
            let low = desc.to_ascii_lowercase();
            if !(low.contains("speedcam") || low.contains("speed_cam") || low.contains("speedcamera")) {
                continue;
            }
            if let Some(pmg) = pmg_path_of(desc) {
                let found = read_pmg_cameras(files, &pmg, &hookups)?;
                if !found.is_empty() {
                    model_cams.insert(token, found);
                }
            }
        }

        Ok(Self { hookups, sign_paths, model_cams, sign_cache: HashMap::new() })
    }

    pub fn is_empty(&self) -> bool {
        self.hookups.is_empty()
    }

    pub fn has_model(&self, model: u64) -> bool {
        self.model_cams.contains_key(&model)
    }

    /// Returns true if `sign_model` has at least one speed-camera locator, reading its `.pmg` on first encounter.
    pub fn is_sign_camera(&mut self, files: &GameFiles, sign_model: u64) -> bool {
        if self.hookups.is_empty() {
            return false;
        }
        if let Some(cached) = self.sign_cache.get(&sign_model) {
            return !cached.is_empty();
        }
        let locators = self
            .sign_paths
            .get(&sign_model)
            .and_then(|path| read_pmg_cameras(files, path, &self.hookups).ok())
            .unwrap_or_default();
        let hit = !locators.is_empty();
        self.sign_cache.insert(sign_model, locators);
        hit
    }

    fn sign_locators(&self, sign_model: u64) -> Option<&[CameraLocator]> {
        self.sign_cache.get(&sign_model).filter(|v| !v.is_empty()).map(Vec::as_slice)
    }

    fn model_locators(&self, model: u64) -> Option<&[CameraLocator]> {
        self.model_cams.get(&model).map(Vec::as_slice)
    }
}

fn pmg_path_of(desc: &str) -> Option<String> {
    let trimmed = desc.trim().trim_matches('"');
    trimmed.strip_suffix(".pmd").map(|stem| format!("{stem}.pmg"))
}

fn read_pmg_cameras(
    files: &GameFiles,
    pmg_path: &str,
    hookups: &HashMap<String, bool>,
) -> Result<Vec<CameraLocator>, FileError> {
    let Some(bytes) = files.read(pmg_path)? else { return Ok(Vec::new()) };
    let Some(pmg) = Pmg::read(&bytes) else { return Ok(Vec::new()) };
    let count = pmg.locator_count().unwrap_or(0);
    let mut cameras = Vec::new();
    for index in 0..count {
        let Some(name) = pmg.locator_hookup(index) else { continue };
        let Some(&reverse) = hookups.get(name) else { continue };
        let Some(locator) = pmg.locator(index) else { continue };
        if locator.position.iter().all(|v| v.is_finite()) && locator.rotation.iter().all(|v| v.is_finite()) {
            cameras.push(CameraLocator { position: locator.position, rotation: locator.rotation, reverse });
        }
    }
    Ok(cameras)
}

/// Extracts all placed fixed speed cameras inside `bounds` (`[min_x, min_z, max_x, max_z]`).
pub fn extract(map: &Map, catalog: &SpeedCameraCatalog, bounds: [f32; 4]) -> Vec<SpeedCamera> {
    if catalog.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let in_bounds = |x: f32, z: f32| x >= bounds[0] && x <= bounds[2] && z >= bounds[1] && z <= bounds[3];

    let mut push_placed = |locators: &[CameraLocator], node: &Node, scale: [f32; 3]| {
        for loc in locators {
            let cam = place_locator(loc, node, scale);
            if cam.x.is_finite() && cam.y.is_finite() && cam.z.is_finite() && in_bounds(cam.x, cam.z) {
                out.push(cam);
            }
        }
    };

    for item in &map.items {
        match &item.data {
            ItemData::RoadSide { sign_model, node, .. } => {
                if let (Some(locs), Some(node)) = (catalog.sign_locators(*sign_model), map.nodes.get(node)) {
                    push_placed(locs, node, [1.0, 1.0, 1.0]);
                }
            }
            ItemData::Model { model, node, scale } => {
                if let (Some(locs), Some(node)) = (catalog.model_locators(*model), map.nodes.get(node)) {
                    push_placed(locs, node, *scale);
                }
            }
            _ => {}
        }
    }

    for model in &map.models {
        if let (Some(locs), Some(node)) = (catalog.model_locators(model.model), map.nodes.get(&model.node)) {
            push_placed(locs, node, model.scale);
        }
    }

    out
}

fn place_locator(loc: &CameraLocator, node: &Node, scale: [f32; 3]) -> SpeedCamera {
    let scaled = [
        f64::from(loc.position[0]) * f64::from(scale[0]),
        f64::from(loc.position[1]) * f64::from(scale[1]),
        f64::from(loc.position[2]) * f64::from(scale[2]),
    ];
    let q_node = node.rotation.map(f64::from);
    let offset = rotate_quat(q_node, scaled);
    let x = f64::from(node.position[0]) + offset[0];
    let y = f64::from(node.position[1]) + offset[1];
    let z = f64::from(node.position[2]) + offset[2];

    let q_loc = loc.rotation.map(f64::from);
    let q_world = mul_quat(q_node, q_loc);
    let fwd = rotate_quat(q_world, [0.0, 0.0, -1.0]);
    let yaw = (-fwd[0]).atan2(-fwd[2]);
    let heading = (yaw / (2.0 * std::f64::consts::PI)).rem_euclid(1.0) as f32;

    SpeedCamera { x: x as f32, y: y as f32, z: z as f32, heading, reverse: loc.reverse }
}

fn rotate_quat(q: [f64; 4], v: [f64; 3]) -> [f64; 3] {
    let [w, x, y, z] = q;
    let t = [2.0 * (y * v[2] - z * v[1]), 2.0 * (z * v[0] - x * v[2]), 2.0 * (x * v[1] - y * v[0])];
    [v[0] + w * t[0] + y * t[2] - z * t[1], v[1] + w * t[1] + z * t[0] - x * t[2], v[2] + w * t[2] + x * t[1] - y * t[0]]
}

fn mul_quat(a: [f64; 4], b: [f64; 4]) -> [f64; 4] {
    [
        a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
        a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
        a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
        a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::{GameFiles, Mount};
    use crate::sector::{Item, item_type};
    use std::fs;
    use std::path::PathBuf;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!("westplay_speedcam_{name}_{}", std::process::id()));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn write(&self, rel: &str, bytes: &[u8]) {
            let full = self.0.join(rel);
            fs::create_dir_all(full.parent().unwrap()).unwrap();
            fs::write(full, bytes).unwrap();
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn pmg_with_hookup(hookup: &str, pos: [f32; 3], rot: [f32; 4]) -> Vec<u8> {
        let mut data = vec![0u8; 0x200];
        let put = |buf: &mut Vec<u8>, at: usize, val: u32| buf[at..at + 4].copy_from_slice(&val.to_le_bytes());
        let put_f = |buf: &mut Vec<u8>, at: usize, val: f32| buf[at..at + 4].copy_from_slice(&val.to_le_bytes());
        put(&mut data, 0, crate::pmg::CURRENT);
        put(&mut data, 20, 1); // locator_count
        put(&mut data, 80, 0x88); // locators_at
        put(&mut data, 84, 0x88 + 44); // pieces_at
        put(&mut data, 88, 0x100); // string_pool_at
        put(&mut data, 92, (hookup.len() + 1) as u32);
        put_f(&mut data, 0x88 + 8, pos[0]);
        put_f(&mut data, 0x88 + 12, pos[1]);
        put_f(&mut data, 0x88 + 16, pos[2]);
        put_f(&mut data, 0x88 + 24, rot[0]);
        put_f(&mut data, 0x88 + 28, rot[1]);
        put_f(&mut data, 0x88 + 32, rot[2]);
        put_f(&mut data, 0x88 + 36, rot[3]);
        put(&mut data, 0x88 + 40, 0);
        data[0x100..0x100 + hookup.len()].copy_from_slice(hookup.as_bytes());
        data
    }

    #[test]
    fn loads_hookup_and_extracts_placed_sign_camera_in_world_space() {
        let dir = TempDir::new("extract");
        dir.write(
            "unit/hookup/speed_camera.sii",
            b"SiiNunit\n{\nspeed_camera: speedcam.20\n{\n\ttrigger_distance: 8.0\n}\nspeed_camera: speedcam.r\n{\n\treverse_direction: true\n}\n}\n",
        );
        dir.write(
            "def/world/sign.sii",
            b"SiiNunit\n{\nsign_model : sign.cam1\n{\n\tmodel_desc: \"/model/cam1.pmd\"\n}\nsign_model : sign.plain\n{\n\tmodel_desc: \"/model/plain.pmd\"\n}\n}\n",
        );
        dir.write(
            "model/cam1.pmg",
            &pmg_with_hookup("speedcam.r", [4.0, 0.0, 0.0], [1.0, 0.0, 0.0, 0.0]),
        );
        dir.write("model/plain.pmg", &pmg_with_hookup("other.hookup", [0.0; 3], [1.0, 0.0, 0.0, 0.0]));

        let files = GameFiles::new(vec![Mount::Folder(dir.0.clone())]);
        let mut catalog = SpeedCameraCatalog::load(&files).unwrap();
        let cam1 = string_to_token("cam1").unwrap();
        let plain = string_to_token("plain").unwrap();
        assert!(catalog.is_sign_camera(&files, cam1));
        assert!(!catalog.is_sign_camera(&files, plain));

        let mut nodes = HashMap::new();
        // 90 deg counter-clockwise around Y (facing West -x): (cos 45, 0, sin 45, 0)
        let s = std::f32::consts::FRAC_1_SQRT_2;
        nodes.insert(1, Node { uid: 1, position: [100.0, 5.0, 200.0], rotation: [s, 0.0, s, 0.0], backward_item: 0, forward_item: 0, flags: 0 });
        let map = Map {
            items: vec![
                Item {
                    uid: 10,
                    item_type: item_type::ROAD_SIDE,
                    bounds: [90.0, 190.0, 110.0, 210.0],
                    data: ItemData::RoadSide { dlc_guard: 0, sign_model: cam1, node: 1 },
                },
                Item {
                    uid: 11,
                    item_type: item_type::ROAD_SIDE,
                    bounds: [90.0, 190.0, 110.0, 210.0],
                    data: ItemData::RoadSide { dlc_guard: 0, sign_model: plain, node: 1 },
                },
            ],
            nodes,
            road_terrain: HashMap::new(),
            prefab_data: HashMap::new(),
            models: Vec::new(),
            walls: Vec::new(),
        };

        let cams = extract(&map, &catalog, [0.0, 0.0, 500.0, 500.0]);
        assert_eq!(cams.len(), 1);
        // Local +x (4, 0, 0) rotated +90deg around Y becomes (0, 0, -4)
        assert!((cams[0].x - 100.0).abs() < 1e-3);
        assert!((cams[0].y - 5.0).abs() < 1e-3);
        assert!((cams[0].z - 196.0).abs() < 1e-3);
        assert!((cams[0].heading - 0.25).abs() < 1e-3);
        assert!(cams[0].reverse);
    }
}
