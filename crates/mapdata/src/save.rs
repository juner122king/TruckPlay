//! The player's save games (`profiles/<profile>/save/<slot>/game.sii`, in the game's documents folder or
//! Steam Cloud's): which garages the player owns, and their headquarters. A save is SII units, as the
//! game's definitions are, written one of three ways:
//!
//! - encrypted (`ScsC`, the game's default): a 32-byte HMAC, a 16-byte IV and the unpacked size (u32),
//!   then AES-256-CBC (the game's fixed key) over zlib-packed data, either of the two below;
//! - binary (`BSII`, version 1 to 3): blocks, each starting with a u32. Zero begins a structure
//!   definition: a validity byte (none: the end), the structure's id (u32), its name, then fields (a value
//!   type, u32, and a name; an ordinal string type adds its table of u32 and string pairs) until a type of
//!   zero. Anything else is a unit of the structure with that id: its id (an ID, below), then its fields'
//!   values in order. Strings are a u32 length and bytes; an ID is a length byte, then that many tokens
//!   (u64, [`crate::token`]), or one u64 address for 0xFF (an unnamed unit); arrays are a u32 count and
//!   their values;
//! - text (`SiiNunit`, with `g_save_format 2` in the game's config);
//! - scrambled text (`3nK`, as some mods' manifests are: [`unscramble`]).
//!
//! The binary layout follows SII_Decrypt's decoder (TheLazyTomcat, <https://github.com/TheLazyTomcat/SII_Decrypt>),
//! learned from, not copied.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::fmt;
use std::io::Read;
use std::path::{Path, PathBuf};

use aes::cipher::block_padding::Pkcs7;
use aes::cipher::{BlockDecryptMut, KeyIvInit};
use serde::Serialize;

use crate::reader::{OutOfBounds, Reader};
use crate::sii::{self, Unit};
use crate::token::token_to_string;

/// The key the game encrypts its saves (and other SII files) with.
const KEY: [u8; 32] = [
    0x2a, 0x5f, 0xcb, 0x17, 0x91, 0xd2, 0x2f, 0xb6, 0x02, 0x45, 0xb3, 0xd8, 0x36, 0x9e, 0xd0, 0xb2, 0xc2, 0x73, 0x71,
    0x56, 0x3f, 0xbf, 0x1f, 0x3c, 0x9e, 0xdf, 0x6b, 0x11, 0x82, 0x5a, 0x5d, 0x0a,
];

#[derive(Debug)]
pub enum SaveError {
    /// Neither encrypted, binary nor text SII.
    UnknownFormat,
    /// Doesn't decrypt or unpack.
    Undecryptable,
    UnsupportedVersion(u32),
    /// A value type this reader doesn't know (it can't tell how long the value is).
    UnknownValueType(u32),
    UnknownStructure(u32),
    Truncated,
    /// Unpacks to more than any file can be ([`crate::archive::MOST_ENTRY`]).
    TooLarge,
}

impl fmt::Display for SaveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownFormat => write!(f, "not a save game"),
            Self::Undecryptable => write!(f, "doesn't decrypt"),
            Self::UnsupportedVersion(version) => write!(f, "binary SII version {version} isn't read"),
            Self::UnknownValueType(kind) => write!(f, "unknown value type {kind:#x}"),
            Self::UnknownStructure(id) => write!(f, "a unit of undefined structure {id}"),
            Self::Truncated => write!(f, "ends early"),
            Self::TooLarge => write!(f, "unpacks to more than 1 GiB"),
        }
    }
}

impl std::error::Error for SaveError {}

impl From<OutOfBounds> for SaveError {
    fn from(_: OutOfBounds) -> Self {
        Self::Truncated
    }
}

/// The units of a save file (`game.sii`), however it's written.
pub fn read(data: &[u8]) -> Result<Vec<Unit>, SaveError> {
    match data.get(..4) {
        Some(b"ScsC") => read(&decrypt(data)?),
        Some(b"3nK\x01") => read(&unscramble(data)?),
        Some(b"BSII") => binary(data),
        Some(b"SiiN") => Ok(sii::parse(&String::from_utf8_lossy(data))),
        _ => Err(SaveError::UnknownFormat),
    }
}

/// A text file's text, unscrambled if scrambled (`3nK`: [`unscramble`]; Oyuncuyusbis' coaches' definitions since
/// their 2026-11 versions); any other file as it is.
pub fn text(data: &[u8]) -> Result<std::borrow::Cow<'_, [u8]>, SaveError> {
    match data.get(..4) {
        Some(b"3nK\x01") => Ok(std::borrow::Cow::Owned(unscramble(data)?)),
        _ => Ok(std::borrow::Cow::Borrowed(data)),
    }
}

/// A definition file's SII, however it's written ([`crate::sii`]): its text (decrypted, unscrambled), or a binary
/// file's units.
pub(crate) enum Sii<'a> {
    Text(std::borrow::Cow<'a, [u8]>),
    Units(Vec<Unit>),
}

/// A definition file's SII ([`Sii`]): encrypted (`ScsC`, then any of the rest), scrambled (`3nK`), binary (`BSII`) or
/// text; whatever else, taken as text.
pub(crate) fn definitions(data: &[u8]) -> Result<Sii<'_>, SaveError> {
    match data.get(..4) {
        Some(b"ScsC") => {
            let decrypted = decrypt(data)?;
            Ok(match definitions(&decrypted)? {
                Sii::Text(text) => Sii::Text(std::borrow::Cow::Owned(text.into_owned())),
                Sii::Units(units) => Sii::Units(units),
            })
        }
        Some(b"3nK\x01") => Ok(Sii::Text(std::borrow::Cow::Owned(unscramble(data)?))),
        Some(b"BSII") => Ok(Sii::Units(binary(data)?)),
        _ => Ok(Sii::Text(std::borrow::Cow::Borrowed(data))),
    }
}

/// A scrambled file's text (`3nK`, a byte, then the seed: SCS's own light scrambling, which the game reads as it
/// reads text): each byte XORed with a key from the seed and its place, `((((x << 2) ^ !x) << 3) ^ x)` for `x` the
/// seed plus the place, in a byte. Measured on mods' manifests (2026-10-24): each one so comes to `SiiNunit…`.
fn unscramble(data: &[u8]) -> Result<Vec<u8>, SaveError> {
    let seed = *data.get(5).ok_or(SaveError::Truncated)?;
    let key = |place: usize| {
        let x = seed.wrapping_add(place as u8);
        (((x << 2) ^ !x) << 3) ^ x
    };
    Ok(data[6..].iter().enumerate().map(|(place, &byte)| byte ^ key(place)).collect())
}

fn decrypt(data: &[u8]) -> Result<Vec<u8>, SaveError> {
    let iv: [u8; 16] = data.get(36..52).ok_or(SaveError::Truncated)?.try_into().unwrap();
    let size = u32::from_le_bytes(data.get(52..56).ok_or(SaveError::Truncated)?.try_into().unwrap()) as usize;
    let mut body = data[56..].to_vec();
    let packed = cbc::Decryptor::<aes::Aes256>::new(&KEY.into(), &iv.into())
        .decrypt_padded_mut::<Pkcs7>(&mut body)
        .map_err(|_| SaveError::Undecryptable)?;
    // The size is the file's word: the room grows with the real output, never past what a file can be.
    let most = crate::archive::MOST_ENTRY;
    let mut unpacked = Vec::with_capacity(crate::archive::starting_room(packed.len(), size));
    flate2::read::ZlibDecoder::new(packed)
        .take(most as u64 + 1)
        .read_to_end(&mut unpacked)
        .map_err(|_| SaveError::Undecryptable)?;
    if unpacked.len() > most {
        return Err(SaveError::TooLarge);
    }
    Ok(unpacked)
}

/// A structure: its name, and its fields' value types, names and ordinal string tables.
struct Structure {
    name: String,
    fields: Vec<(u32, String, HashMap<u32, String>)>,
}

fn binary(data: &[u8]) -> Result<Vec<Unit>, SaveError> {
    let mut r = Reader::new(data);
    r.skip(4)?;
    let version = r.u32()?;
    if !(1..=3).contains(&version) {
        return Err(SaveError::UnsupportedVersion(version));
    }
    let mut structures: HashMap<u32, Structure> = HashMap::new();
    let mut units = Vec::new();
    loop {
        let block = r.u32()?;
        if block == 0 {
            if r.u8()? == 0 {
                return Ok(units);
            }
            let id = r.u32()?;
            let name = string(&mut r)?;
            let mut fields = Vec::new();
            loop {
                let kind = r.u32()?;
                if kind == 0 {
                    break;
                }
                let field = string(&mut r)?;
                let mut ordinals = HashMap::new();
                if kind == ORDINAL {
                    for _ in 0..r.u32()? {
                        let value = r.u32()?;
                        ordinals.insert(value, string(&mut r)?);
                    }
                }
                fields.push((kind, field, ordinals));
            }
            structures.insert(id, Structure { name, fields });
            continue;
        }
        let structure = structures.get(&block).ok_or(SaveError::UnknownStructure(block))?;
        let mut unit = Unit { class: structure.name.clone(), name: id(&mut r)?, attributes: Vec::new() };
        for (kind, field, ordinals) in &structure.fields {
            for value in values(&mut r, *kind, version, ordinals)? {
                unit.attributes.push((field.clone(), value));
            }
        }
        units.push(unit);
    }
}

const ORDINAL: u32 = 0x37;

fn string(r: &mut Reader) -> Result<String, SaveError> {
    let length = r.u32()? as usize;
    Ok(String::from_utf8_lossy(r.bytes(length)?).into_owned())
}

/// An ID as the text format writes it: its tokens joined with dots, `null` if empty, or an unnamed unit's
/// address (`_nameless.1234.5678`).
fn id(r: &mut Reader) -> Result<String, SaveError> {
    match r.u8()? {
        0 => Ok("null".into()),
        0xFF => {
            let address = r.u64()?;
            let parts: Vec<String> = (0..4).rev().map(|i| format!("{:04x}", (address >> (i * 16)) & 0xFFFF)).collect();
            Ok(format!("_nameless.{}", parts.join(".")))
        }
        length => {
            let tokens: Vec<String> = (0..length)
                .map(|_| Ok(token_to_string(r.u64()?).unwrap_or_default()))
                .collect::<Result<_, SaveError>>()?;
            Ok(tokens.join("."))
        }
    }
}

/// A field's value as text, or an array's values (arrays are a u32 count and their values).
fn values(r: &mut Reader, kind: u32, version: u32, ordinals: &HashMap<u32, String>) -> Result<Vec<String>, SaveError> {
    let floats = |r: &mut Reader, n: usize| -> Result<String, SaveError> {
        let values: Vec<String> = (0..n).map(|_| r.f32().map(|v| v.to_string())).collect::<Result<_, _>>()?;
        Ok(format!("({})", values.join(", ")))
    };
    let one = |r: &mut Reader, kind: u32| -> Result<String, SaveError> {
        Ok(match kind {
            0x01 => string(r)?,
            0x03 => token_to_string(r.u64()?).unwrap_or_default(),
            0x05 => r.f32()?.to_string(),
            0x07 => floats(r, 2)?,
            0x09 => floats(r, 3)?,
            0x11 => format!("({}, {}, {})", r.i32()?, r.i32()?, r.i32()?),
            0x17 => floats(r, 4)?,
            // Position and rotation: from version 2, eight floats (the fourth extending the position's
            // range), before it seven.
            0x19 => floats(r, if version >= 2 { 8 } else { 7 })?,
            0x25 => r.i32()?.to_string(),
            0x27 | 0x2F => r.u32()?.to_string(),
            0x2B => r.u16()?.to_string(),
            0x31 => (r.u64()? as i64).to_string(),
            0x33 => r.u64()?.to_string(),
            0x35 => (r.u8()? != 0).to_string(),
            ORDINAL => {
                let value = r.u32()?;
                ordinals.get(&value).cloned().unwrap_or_else(|| value.to_string())
            }
            0x39 | 0x3B | 0x3D => id(r)?,
            other => return Err(SaveError::UnknownValueType(other)),
        })
    };
    // Array types are their element's type plus one.
    let array_of = match kind {
        0x02 | 0x04 | 0x06 | 0x08 | 0x0A | 0x12 | 0x18 | 0x1A | 0x26 | 0x28 | 0x2C | 0x32 | 0x34 | 0x36 | 0x3A
        | 0x3C => Some(kind - 1),
        _ => None,
    };
    match array_of {
        Some(element) => (0..r.u32()?).map(|_| one(r, element)).collect(),
        None => Ok(vec![one(r, kind)?]),
    }
}

/// What a save says of the player's garages: the cities whose garages they own, and their headquarters'.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Garages {
    pub owned: BTreeSet<String>,
    pub headquarters: Option<String>,
}

/// The player's garages in a save's units: `garage : garage.<city>` units with a `status` other than 0
/// (0: not bought; then its size), and the player's `hq_city`.
pub fn garages(units: &[Unit]) -> Garages {
    let owned = units
        .iter()
        .filter(|unit| unit.class == "garage")
        .filter(|unit| unit.get("status").is_some_and(|status| status != "0"))
        .filter_map(|unit| unit.name.strip_prefix("garage.").map(str::to_owned))
        .collect();
    let headquarters = units
        .iter()
        .find(|unit| unit.class == "player")
        .and_then(|unit| unit.get("hq_city"))
        .filter(|city| !city.is_empty() && *city != "null")
        .map(str::to_owned);
    Garages { owned, headquarters }
}

/// Active bank loan parsed from a `bank_loan` unit in `game.sii`.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BankLoan {
    pub amount: i64,
    pub original_amount: i64,
    pub interest_rate: f32,
    pub remaining_days: u32,
    pub daily_repayment: i64,
}

/// Player bank status parsed from `bank` and `bank_loan` units in `game.sii`.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BankInfo {
    pub money_account: i64,
    pub loans: Vec<BankLoan>,
}

/// Summary of an owned garage from `game.sii`.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GarageSummary {
    pub city_id: String,
    pub status: u32,
    pub vehicle_count: u32,
    pub driver_count: u32,
    pub is_hq: bool,
}

/// Summary of a hired AI driver from `driver_ai` units referenced by owned garages/player.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HiredDriver {
    pub id: String,
    pub garage_city: String,
    pub current_city: String,
    pub state: u32,
    pub on_duty_timer: i32,
    pub skill_points: u32,
    pub last_profit: Option<i64>,
}

/// Used truck market offer defensively parsed from `game.sii` (ETS2/ATS 1.49+).
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsedTruckOffer {
    pub id: String,
    pub model: String,
    pub price: i64,
    pub odometer_km: u32,
    pub wear: f32,
    pub expiration_time: Option<u32>,
}

/// Company, fleet, financial, and used-truck data extracted from the player's latest save.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanySnapshot {
    pub company_name: Option<String>,
    pub player_name: Option<String>,
    pub bank: BankInfo,
    pub garages: Vec<GarageSummary>,
    pub drivers: Vec<HiredDriver>,
    pub used_trucks: Vec<UsedTruckOffer>,
}

fn parse_i64(value: &str) -> Option<i64> {
    let trimmed = value.trim();
    trimmed.parse::<i64>().ok().or_else(|| trimmed.parse::<f64>().ok().map(|v| v.round() as i64))
}

fn parse_u32(value: &str) -> Option<u32> {
    let trimmed = value.trim();
    trimmed.parse::<u32>().ok().or_else(|| trimmed.parse::<f64>().ok().filter(|v| *v >= 0.0).map(|v| v.round() as u32))
}

fn parse_f32(value: &str) -> Option<f32> {
    value.trim().parse::<f32>().ok().filter(|v| v.is_finite())
}

fn is_ref(value: &str) -> bool {
    let v = value.trim();
    !v.is_empty() && v != "null" && !v.chars().all(|c| c.is_ascii_digit())
}

fn truck_model_from_data_path(path: &str) -> Option<String> {
    let rest = path.split("/def/vehicle/truck/").nth(1)?;
    let model = rest.split('/').next()?;
    (!model.is_empty()).then(|| model.to_owned())
}

fn parse_bank_loan(u: &Unit) -> Option<BankLoan> {
    let amount = u.get("amount").and_then(parse_i64).unwrap_or(0);
    if amount <= 0 {
        return None;
    }
    let original_amount = u.get("original_amount").and_then(parse_i64).unwrap_or(amount);
    let interest_rate = u.get("interest_rate").and_then(parse_f32).unwrap_or(0.0);
    let remaining_days = u.get("remaining_days").or_else(|| u.get("duration")).and_then(parse_u32).unwrap_or(0);
    let daily_repayment = u.get("daily_repayment").and_then(parse_i64).filter(|&v| v > 0).unwrap_or_else(|| {
        if remaining_days > 0 { (amount + i64::from(remaining_days) - 1) / i64::from(remaining_days) } else { 0 }
    });
    Some(BankLoan { amount, original_amount, interest_rate, remaining_days, daily_repayment })
}

fn parse_bank_info(units: &[Unit], by_name: &HashMap<&str, &Unit>) -> BankInfo {
    let bank_unit = units.iter().find(|u| u.class == "bank");
    let money_account = bank_unit.and_then(|u| u.get("money_account")).and_then(parse_i64).unwrap_or(0);
    let loan_refs: Vec<&str> = bank_unit.map(|u| u.all("loans").filter(|v| is_ref(v)).collect()).unwrap_or_default();

    let mut loans: Vec<BankLoan> = if !loan_refs.is_empty() {
        loan_refs.iter().filter_map(|id| by_name.get(id).and_then(|u| parse_bank_loan(u))).collect()
    } else {
        units.iter().filter(|u| u.class == "bank_loan").filter_map(parse_bank_loan).collect()
    };
    loans.sort_by_key(|a| std::cmp::Reverse(a.amount));
    BankInfo { money_account, loans }
}

fn parse_garages_and_hired(
    units: &[Unit],
    player_unit: Option<&Unit>,
    hq_city: Option<&str>,
) -> (Vec<GarageSummary>, HashMap<String, String>, HashSet<String>) {
    let mut garages = Vec::new();
    let mut driver_garage = HashMap::new();
    let mut hired_ids = HashSet::new();

    if let Some(p) = player_unit {
        for d in p.all("drivers").filter(|v| is_ref(v) && *v != "driver.player") {
            hired_ids.insert(d.to_owned());
        }
    }

    for u in units.iter().filter(|u| u.class == "garage") {
        let status = u.get("status").and_then(parse_u32).unwrap_or(0);
        if status == 0 {
            continue;
        }
        let Some(city_id) = u.name.strip_prefix("garage.").map(str::to_owned) else { continue };
        let vehicle_count = u.all("vehicles").filter(|v| is_ref(v)).count() as u32;
        let mut driver_count = 0u32;
        for d in u.all("drivers").filter(|v| is_ref(v)) {
            driver_count += 1;
            if d != "driver.player" {
                hired_ids.insert(d.to_owned());
                driver_garage.insert(d.to_owned(), city_id.clone());
            }
        }
        garages.push(GarageSummary {
            city_id: city_id.clone(),
            status,
            vehicle_count,
            driver_count,
            is_hq: hq_city == Some(city_id.as_str()),
        });
    }
    garages.sort_by(|a, b| b.is_hq.cmp(&a.is_hq).then_with(|| a.city_id.cmp(&b.city_id)));
    (garages, driver_garage, hired_ids)
}

fn parse_hired_drivers(
    units: &[Unit],
    by_name: &HashMap<&str, &Unit>,
    driver_garage: &HashMap<String, String>,
    hired_ids: &HashSet<String>,
) -> Vec<HiredDriver> {
    let mut drivers = Vec::new();
    for u in units.iter().filter(|u| u.class == "driver_ai" && hired_ids.contains(&u.name)) {
        let hometown = u.get("hometown").filter(|s| is_ref(s)).unwrap_or_default().to_owned();
        let garage_city = driver_garage.get(&u.name).cloned().unwrap_or(hometown);
        let current_city =
            u.get("current_city").filter(|s| is_ref(s)).map(str::to_owned).unwrap_or_else(|| garage_city.clone());
        let state = u.get("state").and_then(parse_u32).unwrap_or(1);
        let on_duty_timer = u.get("on_duty_timer").and_then(parse_i64).unwrap_or(0) as i32;
        let skill_points = u.get("adr").and_then(parse_u32).map(u32::count_ones).unwrap_or(0)
            + ["long_dist", "heavy", "fragile", "urgent", "mechanical"]
                .iter()
                .filter_map(|k| u.get(k).and_then(parse_u32))
                .sum::<u32>();

        let last_profit = u
            .get("profit_log")
            .and_then(|log_id| by_name.get(log_id))
            .and_then(|log_unit| log_unit.all("stats_data").filter(|v| is_ref(v)).last())
            .and_then(|entry_id| by_name.get(entry_id))
            .and_then(|entry| {
                let revenue = entry.get("revenue").and_then(parse_i64)?;
                let costs: i64 =
                    ["wage", "maintenance", "fuel"].iter().filter_map(|k| entry.get(k).and_then(parse_i64)).sum();
                Some(revenue - costs)
            });

        drivers.push(HiredDriver {
            id: u.name.clone(),
            garage_city,
            current_city,
            state,
            on_duty_timer,
            skill_points,
            last_profit,
        });
    }
    drivers.sort_by(|a, b| a.garage_city.cmp(&b.garage_city).then_with(|| a.id.cmp(&b.id)));
    drivers
}

fn parse_used_trucks(units: &[Unit], by_name: &HashMap<&str, &Unit>) -> Vec<UsedTruckOffer> {
    let mut offer_units: Vec<&Unit> = units
        .iter()
        .filter(|u| matches!(u.class.as_str(), "used_vehicle_offer" | "used_truck_offer" | "used_vehicle"))
        .collect();
    if offer_units.is_empty() {
        for container in units.iter().filter(|u| u.class.contains("used_vehicle") || u.class == "economy") {
            for r in container.all("used_vehicles").chain(container.all("offers")).filter(|v| is_ref(v)) {
                if let Some(u) = by_name.get(r) {
                    offer_units.push(u);
                }
            }
        }
    }

    let mut used_trucks = Vec::new();
    for u in offer_units {
        let vehicle_unit = u.get("vehicle").or_else(|| u.get("truck")).and_then(|vid| by_name.get(vid).copied());
        let target = vehicle_unit.unwrap_or(u);
        let model = u
            .get("model")
            .or_else(|| u.get("vehicle_model"))
            .filter(|s| is_ref(s))
            .map(str::to_owned)
            .or_else(|| {
                target
                    .all("accessories")
                    .filter_map(|acc| by_name.get(acc))
                    .filter_map(|acc| acc.get("data_path"))
                    .find_map(truck_model_from_data_path)
            })
            .unwrap_or_default();
        let price = u.get("price").or_else(|| u.get("offer_price")).and_then(parse_i64).unwrap_or(0);
        if model.is_empty() && price <= 0 {
            continue;
        }
        let odometer_km = u.get("odometer").or_else(|| target.get("odometer")).and_then(parse_u32).unwrap_or(0);
        let wear =
            ["wear", "permanent_wear", "engine_wear", "transmission_wear", "cabin_wear", "chassis_wear", "wheels_wear"]
                .iter()
                .filter_map(|k| u.get(k).or_else(|| target.get(k)).and_then(parse_f32))
                .fold(0.0f32, f32::max)
                .clamp(0.0, 1.0);
        let expiration_time = u.get("expiration_game_time").or_else(|| u.get("expiration_time")).and_then(parse_u32);
        used_trucks.push(UsedTruckOffer {
            id: u.name.clone(),
            model: if model.is_empty() { u.name.clone() } else { model },
            price,
            odometer_km,
            wear,
            expiration_time,
        });
    }
    used_trucks.sort_by_key(|a| a.price);
    used_trucks
}

/// Extracts bank balance/loans, owned garages, hired drivers, and used-truck market listings from `game.sii`
/// units (plus optional `profile.sii` units for company/player names).
pub fn company_snapshot(units: &[Unit], profile_units: Option<&[Unit]>) -> CompanySnapshot {
    let by_name: HashMap<&str, &Unit> = units.iter().map(|u| (u.name.as_str(), u)).collect();
    let (company_name, player_name) = profile_units
        .and_then(|pu| pu.iter().find(|u| u.class == "user_profile"))
        .map(|u| {
            (
                u.get("company_name").filter(|s| !s.is_empty()).map(str::to_owned),
                u.get("profile_name").filter(|s| !s.is_empty()).map(str::to_owned),
            )
        })
        .unwrap_or((None, None));

    let player_unit = units.iter().find(|u| u.class == "player");
    let hq_city = player_unit
        .and_then(|u| u.get("hq_city"))
        .filter(|city| !city.is_empty() && *city != "null")
        .map(str::to_owned);

    let bank = parse_bank_info(units, &by_name);
    let (garages, driver_garage, hired_ids) = parse_garages_and_hired(units, player_unit, hq_city.as_deref());
    let drivers = parse_hired_drivers(units, &by_name, &driver_garage, &hired_ids);
    let used_trucks = parse_used_trucks(units, &by_name);

    CompanySnapshot { company_name, player_name, bank, garages, drivers, used_trucks }
}

/// The mods a profile has enabled (its `profile.sii`, read with [`read`]), as the game lists them:
/// `<package>|<name as shown>` (a Steam Workshop mod's package is `mod_workshop_package.<id>`). The list's
/// length, which a text profile writes as an entry of its own (`active_mods: 50`), isn't a mod.
pub fn active_mods(units: &[Unit]) -> Vec<String> {
    units
        .iter()
        .filter(|unit| unit.class == "user_profile")
        .flat_map(|unit| unit.all("active_mods"))
        .filter(|entry| entry.contains('|'))
        .map(str::to_owned)
        .collect()
}

/// A profile (`profile.sii`) without the active mods `drop` picks (by how the profile lists them,
/// `<package>|<name>`), changed in nothing else: the file as the game reads it, decrypted (binary or text, as
/// it was inside; the game reads either, and encrypts it again on its next save). `None` when it lists none
/// of them (it's then left as it is).
///
/// A binary profile keeps every byte but the list's: its count and the entries kept, copied as they were
/// (decoding and writing it again would round its numbers). A text one keeps every line but the dropped
/// entries', the others numbered again and the count said again.
pub fn without_mods(data: &[u8], drop: impl Fn(&str) -> bool) -> Result<Option<Vec<u8>>, SaveError> {
    match data.get(..4) {
        Some(b"ScsC") => without_mods(&decrypt(data)?, drop),
        Some(b"BSII") => binary_without_mods(data, &drop),
        Some(b"SiiN") => Ok(text_without_mods(&String::from_utf8_lossy(data), &drop).map(String::into_bytes)),
        _ => Err(SaveError::UnknownFormat),
    }
}

/// The binary profile's `user_profile` unit's `active_mods`, found by walking the file as [`binary`] does,
/// and spliced without the dropped entries.
fn binary_without_mods(data: &[u8], drop: &dyn Fn(&str) -> bool) -> Result<Option<Vec<u8>>, SaveError> {
    let mut r = Reader::new(data);
    r.skip(4)?;
    let version = r.u32()?;
    if !(1..=3).contains(&version) {
        return Err(SaveError::UnsupportedVersion(version));
    }
    let mut structures: HashMap<u32, Structure> = HashMap::new();
    loop {
        let block = r.u32()?;
        if block == 0 {
            if r.u8()? == 0 {
                return Ok(None);
            }
            let id = r.u32()?;
            let name = string(&mut r)?;
            let mut fields = Vec::new();
            loop {
                let kind = r.u32()?;
                if kind == 0 {
                    break;
                }
                let field = string(&mut r)?;
                let mut ordinals = HashMap::new();
                if kind == ORDINAL {
                    for _ in 0..r.u32()? {
                        let value = r.u32()?;
                        ordinals.insert(value, string(&mut r)?);
                    }
                }
                fields.push((kind, field, ordinals));
            }
            structures.insert(id, Structure { name, fields });
            continue;
        }
        let structure = structures.get(&block).ok_or(SaveError::UnknownStructure(block))?;
        id(&mut r)?;
        let profile = structure.name == "user_profile";
        for (kind, field, ordinals) in &structure.fields {
            // An array of strings: a u32 count, then each a u32 length and its bytes.
            if profile && field == "active_mods" && *kind == 0x02 {
                let start = r.pos();
                let mut kept = Vec::new();
                let mut dropped = 0;
                for _ in 0..r.u32()? {
                    let entry = r.pos();
                    let text = string(&mut r)?;
                    if drop(&text) {
                        dropped += 1;
                    } else {
                        kept.extend_from_slice(&data[entry..r.pos()]);
                    }
                }
                if dropped == 0 {
                    return Ok(None);
                }
                let count = (data[start..start + 4].try_into().map(u32::from_le_bytes).unwrap_or(0)) - dropped;
                let mut out = Vec::with_capacity(data.len());
                out.extend_from_slice(&data[..start]);
                out.extend_from_slice(&count.to_le_bytes());
                out.extend_from_slice(&kept);
                out.extend_from_slice(&data[r.pos()..]);
                return Ok(Some(out));
            }
            values(&mut r, *kind, version, ordinals)?;
        }
    }
}

/// The text profile without the dropped `active_mods[i]: "…"` lines, the rest numbered again, and its
/// `active_mods: n` count said again.
fn text_without_mods(text: &str, drop: &dyn Fn(&str) -> bool) -> Option<String> {
    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let entry = |line: &str| -> Option<String> {
        let rest = line.trim_start().strip_prefix("active_mods[")?;
        let (index, value) = rest.split_once("]:")?;
        (index.is_empty() || index.bytes().all(|b| b.is_ascii_digit()))
            .then(|| value.trim().trim_matches('"').to_owned())
    };
    let lines: Vec<&str> = text.split(newline).collect();
    if !lines.iter().any(|line| entry(line).is_some_and(|value| drop(&value))) {
        return None;
    }
    let kept_count = lines.iter().filter(|line| entry(line).is_some_and(|value| !drop(&value))).count();
    let mut next = 0;
    let mut out = Vec::with_capacity(lines.len());
    for line in lines {
        if let Some(value) = entry(line) {
            if drop(&value) {
                continue;
            }
            let indent = &line[..line.len() - line.trim_start().len()];
            out.push(format!("{indent}active_mods[{next}]: \"{value}\""));
            next += 1;
        } else if line.trim_start().starts_with("active_mods:") {
            let indent = &line[..line.len() - line.trim_start().len()];
            out.push(format!("{indent}active_mods: {kept_count}"));
        } else {
            out.push(line.to_owned());
        }
    }
    Some(out.join(newline))
}

/// The profile file of the profile a save belongs to (`profiles/<profile>/save/<slot>/game.sii` →
/// `profiles/<profile>/profile.sii`).
pub fn profile_of(save: &Path) -> Option<PathBuf> {
    Some(save.parent()?.parent()?.parent()?.join("profile.sii"))
}

/// The save the game wrote last, in any profile, in the game's documents folder or Steam Cloud's for the Steam account
/// signed in (`steam_user`, its folder in Steam's `userdata`; the game's own under it is its Steam app id,
/// `steam_app`): the one being played, unless the game has loaded a profile that hasn't saved since (see
/// [`latest_of`]).
pub fn latest(documents: &Path, steam_user: Option<&Path>, steam_app: &str) -> Option<PathBuf> {
    latest_of(documents, steam_user, steam_app, |_| true)
}

/// [`latest`], of the profiles whose folder's name (the profile's name in hexadecimal) `profile` takes.
pub fn latest_of(
    documents: &Path,
    steam_user: Option<&Path>,
    steam_app: &str,
    profile: impl Fn(&str) -> bool,
) -> Option<PathBuf> {
    let mut profile_dirs = vec![documents.join("profiles"), documents.join("steam_profiles")];
    profile_dirs.extend(steam_user.map(|user| user.join(steam_app).join("remote").join("profiles")));
    let saves = profile_dirs
        .iter()
        .flat_map(|dir| std::fs::read_dir(dir).into_iter().flatten().flatten())
        .filter(|folder| folder.file_name().to_str().is_some_and(&profile))
        .flat_map(|profile| std::fs::read_dir(profile.path().join("save")).into_iter().flatten().flatten())
        .map(|slot| slot.path().join("game.sii"));
    saves
        .filter_map(|path| Some((std::fs::metadata(&path).ok()?.modified().ok()?, path)))
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, path)| path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_scrambled_text() {
        // Scrambled as the game scrambles (the same XOR undoes it), seed 0x50: the key's first bytes 0x28 and 0x01,
        // as measured on a mod's manifest against its `Si`.
        let text = b"SiiNunit\n{\nmod_package : .package_name\n{\n\tauthor: \"Someone\"\n}\n}\n";
        let mut data = b"3nK\x01\x00\x50".to_vec();
        data.extend(text.iter().enumerate().map(|(place, &byte)| {
            let x = 0x50u8.wrapping_add(place as u8);
            byte ^ ((((x << 2) ^ !x) << 3) ^ x)
        }));
        assert_eq!((data[6] ^ b'S', data[7] ^ b'i'), (0x28, 0x01));
        let units = read(&data).unwrap();
        assert_eq!(units[0].get("author"), Some("Someone"));
        assert!(matches!(read(b"3nK\x01\x00"), Err(SaveError::Truncated)));
        // As text: unscrambled, and a plain file as it is.
        assert_eq!(&*super::text(&data).unwrap(), &text[..]);
        assert_eq!(&*super::text(text).unwrap(), &text[..]);
    }

    #[test]
    fn finds_the_newest_save_of_the_profile_asked_for() {
        // Two profiles' saves: W's newer than Eren's (Eren loaded, not saved since).
        let root = std::env::temp_dir().join(format!("westplay-latest-of-{}", std::process::id()));
        let documents = root.join("documents");
        let save = |folder: &str, slot: &str| {
            let dir = documents.join("profiles").join(folder).join("save").join(slot);
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("game.sii"), "x").unwrap();
            std::thread::sleep(std::time::Duration::from_millis(30));
            dir.join("game.sii")
        };
        let eren = save("4572656E", "autosave");
        let w = save("57", "autosave");
        assert_eq!(latest(&documents, None, "227300"), Some(w.clone()));
        // Steam Cloud's for the account signed in, under the game's own app id: ATS's (270880) newer, and not ETS2's.
        let user = root.join("userdata").join("1");
        let cloud = user.join("270880").join("remote").join("profiles").join("41").join("save").join("1");
        std::fs::create_dir_all(&cloud).unwrap();
        std::fs::write(cloud.join("game.sii"), "x").unwrap();
        assert_eq!(latest(&documents, Some(&user), "270880"), Some(cloud.join("game.sii")));
        assert_eq!(latest(&documents, Some(&user), "227300"), Some(w.clone()));
        // Another account's, newer still: not the game's for the one signed in.
        let other = root.join("userdata").join("2").join("227300").join("remote").join("profiles").join("42");
        std::fs::create_dir_all(other.join("save").join("1")).unwrap();
        std::fs::write(other.join("save").join("1").join("game.sii"), "x").unwrap();
        assert_eq!(latest(&documents, Some(&user), "227300"), Some(w));
        assert_eq!(latest_of(&documents, None, "227300", |folder| folder == "4572656E"), Some(eren));
        assert_eq!(latest_of(&documents, None, "227300", |folder| folder == "00"), None);
        let _ = std::fs::remove_dir_all(&root);
    }
    use crate::token::string_to_token;

    /// A binary profile: `user_profile { profile_name, active_mods[], cached_experience }`, as the game writes
    /// one.
    fn binary_profile(mods: &[&str]) -> Vec<u8> {
        let mut b = b"BSII".to_vec();
        let u32le = |b: &mut Vec<u8>, v: u32| b.extend(v.to_le_bytes());
        let text = |b: &mut Vec<u8>, s: &str| {
            b.extend((s.len() as u32).to_le_bytes());
            b.extend(s.as_bytes());
        };
        u32le(&mut b, 3);
        u32le(&mut b, 0);
        b.push(1);
        u32le(&mut b, 4);
        text(&mut b, "user_profile");
        u32le(&mut b, 0x01);
        text(&mut b, "profile_name");
        u32le(&mut b, 0x02);
        text(&mut b, "active_mods");
        u32le(&mut b, 0x05);
        text(&mut b, "cached_experience");
        u32le(&mut b, 0);
        // The unit: unnamed, then its values.
        u32le(&mut b, 4);
        b.push(0xFF);
        b.extend(0x1234_5678_9abc_def0u64.to_le_bytes());
        text(&mut b, "Western");
        u32le(&mut b, mods.len() as u32);
        for m in mods {
            text(&mut b, m);
        }
        b.extend(1234.567f32.to_le_bytes());
        u32le(&mut b, 0);
        b.push(0);
        b
    }

    fn westplay(entry: &str) -> bool {
        entry.split('|').next() == Some("westplay")
    }

    /// A profile without WestPlay's mod is the same profile in everything else, byte for byte where it's
    /// binary; one that doesn't list it is left alone.
    #[test]
    fn takes_a_mod_out_of_a_binary_profile_and_nothing_else() {
        let before = binary_profile(&["promods|ProMods", "westplay|WestPlay", "rta|Real Traffic"]);
        let after = without_mods(&before, westplay).unwrap().expect("changed");
        assert_eq!(after, binary_profile(&["promods|ProMods", "rta|Real Traffic"]));
        let units = read(&after).unwrap();
        assert_eq!(active_mods(&units), ["promods|ProMods", "rta|Real Traffic"]);
        assert_eq!(units[0].get("cached_experience"), read(&before).unwrap()[0].get("cached_experience"));
        assert_eq!(without_mods(&after, westplay).unwrap(), None);
        assert_eq!(without_mods(&binary_profile(&[]), westplay).unwrap(), None);
        assert_eq!(without_mods(&binary_profile(&["westplay|WestPlay"]), westplay).unwrap(), Some(binary_profile(&[])));
    }

    #[test]
    fn takes_a_mod_out_of_a_text_profile_numbering_the_rest_again() {
        let before = "SiiNunit\r\n{\r\nuser_profile : _nameless.1 {\r\n profile_name: Western\r\n active_mods: 3\r\n \
             active_mods[0]: \"promods|ProMods\"\r\n active_mods[1]: \"westplay|WestPlay\"\r\n \
             active_mods[2]: \"rta|Real Traffic\"\r\n cached_experience: 12\r\n}\r\n\r\n}\r\n";
        let after = String::from_utf8(without_mods(before.as_bytes(), westplay).unwrap().unwrap()).unwrap();
        assert_eq!(
            after,
            "SiiNunit\r\n{\r\nuser_profile : _nameless.1 {\r\n profile_name: Western\r\n active_mods: 2\r\n \
             active_mods[0]: \"promods|ProMods\"\r\n active_mods[1]: \"rta|Real Traffic\"\r\n cached_experience: 12\r\n}\r\n\r\n}\r\n"
        );
        assert_eq!(without_mods(after.as_bytes(), westplay).unwrap(), None);
    }

    /// A binary save: a structure `garage` with a token `name`... built as the game writes one.
    fn binary_save() -> Vec<u8> {
        let mut b = b"BSII".to_vec();
        let u32le = |b: &mut Vec<u8>, v: u32| b.extend(v.to_le_bytes());
        let text = |b: &mut Vec<u8>, s: &str| {
            b.extend((s.len() as u32).to_le_bytes());
            b.extend(s.as_bytes());
        };
        u32le(&mut b, 3);
        // Structure 7: garage { status: u32, vehicles: array of IDs, size: ordinal (0 tiny, 2 big) }.
        u32le(&mut b, 0);
        b.push(1);
        u32le(&mut b, 7);
        text(&mut b, "garage");
        u32le(&mut b, 0x27);
        text(&mut b, "status");
        u32le(&mut b, 0x3A);
        text(&mut b, "vehicles");
        u32le(&mut b, ORDINAL);
        text(&mut b, "size");
        u32le(&mut b, 2);
        u32le(&mut b, 0);
        text(&mut b, "tiny");
        u32le(&mut b, 2);
        text(&mut b, "big");
        u32le(&mut b, 0);
        // Two garages: garage.calais (status 2, two trucks), garage.dover (not bought).
        for (city, status, trucks) in [("calais", 2, 2), ("dover", 0, 0)] {
            u32le(&mut b, 7);
            b.push(2);
            b.extend(string_to_token("garage").unwrap().to_le_bytes());
            b.extend(string_to_token(city).unwrap().to_le_bytes());
            u32le(&mut b, status);
            u32le(&mut b, trucks);
            for i in 0..trucks {
                b.push(0xFF);
                b.extend((0x1234_0000u64 + u64::from(i)).to_le_bytes());
            }
            u32le(&mut b, if status == 0 { 0 } else { 2 });
        }
        // Structure 8: player { hq_city: token }.
        u32le(&mut b, 0);
        b.push(1);
        u32le(&mut b, 8);
        text(&mut b, "player");
        u32le(&mut b, 0x03);
        text(&mut b, "hq_city");
        u32le(&mut b, 0);
        u32le(&mut b, 8);
        b.push(0xFF);
        b.extend(1u64.to_le_bytes());
        b.extend(string_to_token("calais").unwrap().to_le_bytes());
        // The end.
        u32le(&mut b, 0);
        b.push(0);
        b
    }

    /// `inner` encrypted as the game encrypts (`ScsC`): packed, then AES-256-CBC with its key, after an HMAC (not
    /// checked: zeros here), the IV and the unpacked size.
    pub(crate) fn encrypted(inner: &[u8]) -> Vec<u8> {
        use aes::cipher::BlockEncryptMut;
        use std::io::Write;
        let mut packer = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        packer.write_all(inner).unwrap();
        let packed = packer.finish().unwrap();
        let iv = [7u8; 16];
        let mut body = packed.clone();
        body.resize(packed.len() + 16, 0);
        let sealed = cbc::Encryptor::<aes::Aes256>::new(&KEY.into(), &iv.into())
            .encrypt_padded_mut::<Pkcs7>(&mut body, packed.len())
            .unwrap()
            .to_vec();
        let mut data = b"ScsC".to_vec();
        data.extend([0u8; 32]);
        data.extend(iv);
        data.extend((inner.len() as u32).to_le_bytes());
        data.extend(sealed);
        data
    }

    /// A definition file reads however the game writes it: text, scrambled, binary, encrypted (over text or binary);
    /// one that can't be is an error, not taken as text.
    #[test]
    fn reads_definitions_however_theyre_written() {
        let text = b"SiiNunit\n{\nroad_look : road.a\n{\n\tname: \"A\"\n}\n}\n";
        let as_text = |sii: Sii| match sii {
            Sii::Text(text) => text.into_owned(),
            Sii::Units(_) => panic!("units"),
        };
        assert_eq!(as_text(definitions(text).unwrap()), text);
        assert_eq!(as_text(definitions(&encrypted(text)).unwrap()), text);
        let mut scrambled = b"3nK\x01\x00\x50".to_vec();
        scrambled.extend(text.iter().enumerate().map(|(place, &byte)| {
            let x = 0x50u8.wrapping_add(place as u8);
            byte ^ ((((x << 2) ^ !x) << 3) ^ x)
        }));
        assert_eq!(as_text(definitions(&scrambled).unwrap()), text);
        for binary in [binary_save(), encrypted(&binary_save())] {
            let Sii::Units(units) = definitions(&binary).unwrap() else { panic!("text") };
            assert_eq!(units[0].name, "garage.calais");
        }
        let mut broken = encrypted(text);
        broken.truncate(70);
        assert!(definitions(&broken).is_err());
        assert!(definitions(b"BSII\x09\x00\x00\x00").is_err());
    }

    #[test]
    fn reads_a_binary_save_into_units() {
        let units = read(&binary_save()).unwrap();
        assert_eq!(units.len(), 3);
        assert_eq!((units[0].class.as_str(), units[0].name.as_str()), ("garage", "garage.calais"));
        assert_eq!(units[0].get("status"), Some("2"));
        assert_eq!(
            units[0].all("vehicles").collect::<Vec<_>>(),
            ["_nameless.0000.0000.1234.0000", "_nameless.0000.0000.1234.0001"]
        );
        assert_eq!(units[0].get("size"), Some("big"));
        assert_eq!(units[2].name, "_nameless.0000.0000.0000.0001");
    }

    #[test]
    fn finds_the_garages_the_player_owns() {
        let garages = garages(&read(&binary_save()).unwrap());
        assert_eq!(garages.owned.into_iter().collect::<Vec<_>>(), ["calais"]);
        assert_eq!(garages.headquarters.as_deref(), Some("calais"));
        // A text save reads the same way.
        let text =
            "SiiNunit\n{\ngarage : garage.berlin {\n status: 1\n}\nplayer : _nameless.1 {\n hq_city: berlin\n}\n}\n";
        let garages = super::garages(&read(text.as_bytes()).unwrap());
        assert_eq!((garages.owned.len(), garages.headquarters.as_deref()), (1, Some("berlin")));
    }

    #[test]
    fn lists_a_profiles_mods_and_finds_it_from_a_save() {
        let text = "SiiNunit
{
user_profile : _nameless.1 {
 active_mods: 2
 active_mods[0]: \"a|Mod A\"
 active_mods[1]: \"b|Mod B\"
}
}
";
        let mods = active_mods(&read(text.as_bytes()).unwrap());
        // A text profile lists its count first, as text arrays do: not a mod.
        assert_eq!(mods, ["a|Mod A", "b|Mod B"]);
        let save = Path::new("profiles/57/save/autosave/game.sii");
        assert_eq!(profile_of(save), Some(PathBuf::from("profiles/57/profile.sii")));
    }

    #[test]
    fn refuses_what_isnt_a_save() {
        assert!(matches!(read(b"PNG?"), Err(SaveError::UnknownFormat)));
        let mut truncated = binary_save();
        truncated.truncate(40);
        assert!(matches!(read(&truncated), Err(SaveError::Truncated)));
    }

    #[test]
    fn extracts_company_bank_drivers_garages_and_used_trucks_from_save() {
        let save_text = r#"SiiNunit
{
bank : _nameless.bank {
 money_account: 248500
 loans: 1
 loans[0]: _nameless.loan1
}
bank_loan : _nameless.loan1 {
 amount: 85000
 original_amount: 100000
 interest_rate: 0.18
 remaining_days: 25
}
player : _nameless.player {
 hq_city: berlin
 drivers: 2
 drivers[0]: driver.player
 drivers[1]: driver.177
}
garage : garage.berlin {
 status: 3
 vehicles: 2
 vehicles[0]: _nameless.v1
 vehicles[1]: _nameless.v2
 drivers: 2
 drivers[0]: driver.player
 drivers[1]: driver.177
}
garage : garage.paris {
 status: 0
}
driver_ai : driver.177 {
 adr: 63
 long_dist: 6
 heavy: 4
 fragile: 3
 urgent: 2
 mechanical: 1
 hometown: berlin
 current_city: hamburg
 state: 2
 on_duty_timer: 420
 profit_log: _nameless.plog1
}
driver_ai : driver.999 {
 hometown: paris
 current_city: paris
 state: 1
}
profit_log : _nameless.plog1 {
 stats_data: 1
 stats_data[0]: _nameless.pentry1
}
profit_log_entry : _nameless.pentry1 {
 revenue: 6400
 wage: 800
 maintenance: 350
 fuel: 450
}
used_vehicle_offer : _nameless.offer1 {
 vehicle: _nameless.used1
 price: 78500
 expiration_game_time: 12000
}
vehicle : _nameless.used1 {
 odometer: 142300
 engine_wear: 0.24
 accessories: 1
 accessories[0]: _nameless.acc1
}
vehicle_accessory : _nameless.acc1 {
 data_path: "/def/vehicle/truck/scania.s_2016/data.sii"
}
}
"#;
        let profile_text = r#"SiiNunit
{
user_profile : _nameless.prof {
 profile_name: "Alex"
 company_name: "EuroExpress Logistics"
}
}
"#;
        let units = read(save_text.as_bytes()).unwrap();
        let prof = read(profile_text.as_bytes()).unwrap();
        let snap = company_snapshot(&units, Some(&prof));

        assert_eq!(snap.company_name.as_deref(), Some("EuroExpress Logistics"));
        assert_eq!(snap.player_name.as_deref(), Some("Alex"));
        assert_eq!(snap.bank.money_account, 248_500);
        assert_eq!(snap.bank.loans.len(), 1);
        assert_eq!(snap.bank.loans[0].amount, 85_000);
        assert_eq!(snap.bank.loans[0].remaining_days, 25);
        assert_eq!(snap.bank.loans[0].daily_repayment, 3400);

        assert_eq!(snap.garages.len(), 1);
        assert_eq!(snap.garages[0].city_id, "berlin");
        assert!(snap.garages[0].is_hq);
        assert_eq!(snap.garages[0].vehicle_count, 2);
        assert_eq!(snap.garages[0].driver_count, 2);

        // Only hired driver.177 is included; unhired driver.999 is excluded.
        assert_eq!(snap.drivers.len(), 1);
        assert_eq!(snap.drivers[0].id, "driver.177");
        assert_eq!(snap.drivers[0].garage_city, "berlin");
        assert_eq!(snap.drivers[0].current_city, "hamburg");
        assert_eq!(snap.drivers[0].state, 2);
        assert_eq!(snap.drivers[0].skill_points, 6 + 6 + 4 + 3 + 2 + 1);
        assert_eq!(snap.drivers[0].last_profit, Some(4800));

        assert_eq!(snap.used_trucks.len(), 1);
        assert_eq!(snap.used_trucks[0].model, "scania.s_2016");
        assert_eq!(snap.used_trucks[0].price, 78_500);
        assert_eq!(snap.used_trucks[0].odometer_km, 142_300);
        assert!((snap.used_trucks[0].wear - 0.24).abs() < 1e-4);
        assert_eq!(snap.used_trucks[0].expiration_time, Some(12000));
    }
}
