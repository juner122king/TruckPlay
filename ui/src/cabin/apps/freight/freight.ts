import { type ClockStyle, formatGameTime, HOURS_24 } from '../../../shared/format'
import type { JobInfo, Telemetry, TruckInfo } from '../../../shared/host'
import { logoBrands } from '../../boot/brand'
import type { MapLabel } from '../../maps/mapData'

/**
 * Automotive In-Cabin Fullscreen Freight HUD Logic & Calculation Engine
 * Contains domain models and calculations required for:
 * - Route progress & delivery buffer margin
 * - Cargo manifest formatting, unit rate, and net payout calculation
 * - Vehicle health & individual component wear evaluation
 * - Driver HOS fatigue countdown & Next Break location simulation
 */

/** Comprehensive ETS2 / ATS city name translations for Chinese system language. */
export const CITY_ZH: Record<string, string> = {
  // Poland
  Szczecin: '什切青',
  Warsaw: '华沙',
  Warszawa: '华沙',
  Krakow: '克拉科夫',
  Kraków: '克拉科夫',
  Wrocław: '弗罗茨瓦夫',
  Poznań: '波兹南',
  Gdańsk: '格但斯克',
  Katowice: '卡托维兹',
  Lublin: '卢布林',
  Białystok: '比亚韦斯托克',
  Bialystok: '比亚韦斯托克',
  Bydgoszcz: '比得哥什',
  Olsztyn: '奥尔什丁',
  Łódź: '罗兹',
  Lodz: '罗兹',

  // Germany
  Berlin: '柏林',
  Duisburg: '杜伊斯堡',
  Hamburg: '汉堡',
  Munich: '慕尼黑',
  München: '慕尼黑',
  Frankfurt: '法兰克福',
  'Frankfurt am Main': '法兰克福',
  Cologne: '科隆',
  Köln: '科隆',
  Stuttgart: '斯图加特',
  Düsseldorf: '杜塞尔多夫',
  Dortmund: '多特蒙德',
  Bremen: '不来梅',
  Hannover: '汉诺威',
  Nuremberg: '纽伦堡',
  Nürnberg: '纽伦堡',
  Leipzig: '莱比锡',
  Dresden: '德累斯顿',
  Kassel: '卡塞尔',
  Mannheim: '曼海姆',
  Erfurt: '埃尔福特',
  Magdeburg: '马格德堡',
  Rostock: '罗斯托克',
  Osnabrück: '奥斯纳布吕克',
  Kiel: '基尔',
  Lübeck: '吕贝克',
  Lubeck: '吕贝克',

  // Netherlands & Belgium
  Amsterdam: '阿姆斯特丹',
  Rotterdam: '鹿特丹',
  Groningen: '格罗宁根',
  Brussels: '布鲁塞尔',
  Bruxelles: '布鲁塞尔',
  Brussel: '布鲁塞尔',
  Antwerp: '安特卫普',
  Antwerpen: '安特卫普',
  Liège: '列日',
  Liege: '列日',

  // France
  Paris: '巴黎',
  Lyon: '里昂',
  Marseille: '马赛',
  Lille: '里尔',
  Bordeaux: '波尔多',
  Toulouse: '图卢兹',
  Strasbourg: '斯特拉斯堡',
  Nantes: '南特',
  Rennes: '雷恩',
  Nice: '尼斯',
  Calais: '加来',
  Dijon: '第戎',
  Metz: '梅斯',
  Reims: '兰斯',
  'Le Havre': '勒阿弗尔',
  Brest: '布雷斯特',
  Montpellier: '蒙彼利埃',

  // UK
  London: '伦敦',
  Manchester: '曼彻斯特',
  Birmingham: '伯明翰',
  Liverpool: '利物浦',
  Glasgow: '格拉斯哥',
  Edinburgh: '爱丁堡',
  Newcastle: '纽卡斯尔',
  Sheffield: '谢菲尔德',
  Southampton: '南安普敦',
  Dover: '多佛',
  Cardiff: '加的夫',
  Aberdeen: '阿伯丁',
  Swansea: '斯旺西',
  Plymouth: '普利茅斯',
  Felixstowe: '菲利克斯托',
  Cambridge: '剑桥',

  // Italy
  Rome: '罗马',
  Roma: '罗马',
  Milan: '米兰',
  Milano: '米兰',
  Turin: '都灵',
  Torino: '都灵',
  Venice: '威尼斯',
  Venezia: '威尼斯',
  Florence: '佛罗伦萨',
  Firenze: '佛罗伦萨',
  Naples: '那不勒斯',
  Napoli: '那不勒斯',
  Bologna: '博洛尼亚',
  Genoa: '热那亚',
  Genova: '热那亚',
  Verona: '维罗纳',
  Bari: '巴里',
  Ancona: '安科纳',
  Palermo: '巴勒莫',
  Catania: '卡塔尼亚',

  // Austria & Switzerland
  Vienna: '维也纳',
  Wien: '维也纳',
  Salzburg: '萨尔茨堡',
  Innsbruck: '因斯布鲁克',
  Linz: '林茨',
  Graz: '格拉茨',
  Klagenfurt: '克拉根福',
  Zurich: '苏黎世',
  Zürich: '苏黎世',
  Geneva: '日内瓦',
  Genève: '日内瓦',
  Bern: '伯尔尼',
  Basel: '巴塞尔',

  // Czech & Slovakia & Hungary
  Prague: '布拉格',
  Praha: '布拉格',
  Brno: '布尔诺',
  Ostrava: '俄斯特拉发',
  Bratislava: '布拉迪斯拉发',
  Košice: '科希策',
  Kosice: '科希策',
  Budapest: '布达佩斯',
  Debrecen: '德布勒森',
  Szeged: '塞格德',
  Pécs: '佩奇',
  Pecs: '佩奇',

  // Scandinavia & Baltics
  Stockholm: '斯德哥尔摩',
  Gothenburg: '哥德堡',
  Göteborg: '哥德堡',
  Malmö: '马尔默',
  Malmo: '马尔默',
  Oslo: '奥斯陆',
  Bergen: '卑尔根',
  Stavanger: '斯塔万格',
  Copenhagen: '哥本哈根',
  København: '哥本哈根',
  Aalborg: '奥尔堡',
  Odense: '欧登塞',
  Helsinki: '赫尔辛基',
  Turku: '图尔库',
  Tampere: '坦佩雷',
  Tallinn: '塔林',
  Riga: '里加',
  Vilnius: '维尔纽斯',
  Klaipėda: '克莱佩达',

  // Iberia
  Madrid: '马德里',
  Barcelona: '巴塞罗那',
  Valencia: '瓦伦西亚',
  Seville: '塞维利亚',
  Sevilla: '塞维利亚',
  Zaragoza: '萨拉戈萨',
  Málaga: '马拉加',
  Bilbao: '毕尔巴鄂',
  Lisbon: '里斯本',
  Lisboa: '里斯本',
  Porto: '波尔图',

  // ATS (American Truck Simulator)
  'Los Angeles': '洛杉矶',
  'San Francisco': '旧金山',
  'Las Vegas': '拉斯维加斯',
  'San Diego': '圣迭戈',
  Phoenix: '菲尼克斯',
  Tucson: '图森',
  Seattle: '西雅图',
  Portland: '波特兰',
  Denver: '丹佛',
  'Salt Lake City': '盐湖城',
  Albuquerque: '阿尔伯克基',
  Boise: '博伊西',
  Houston: '休斯敦',
  Dallas: '达拉斯',
  'San Antonio': '圣安东尼奥',
  Austin: '奥斯汀',
  'El Paso': '埃尔帕索',
  Sacramento: '萨克拉门托',
  Fresno: '弗雷斯诺',
  Bakersfield: '贝克斯菲尔德',
  Reno: '里诺',
}

/** Common company translations for Chinese system language. */
export const COMPANY_ZH: Record<string, string> = {
  ITCC: '欧洲化工',
  Sanbuilders: '圣建重工',
  Kaarfor: '卡福货运',
  'Tree-ET': '泛欧环保',
  TradeAux: '欧贸互通',
  EuroGoodies: '欧品生鲜',
  NBFC: '北方石油',
  Trameri: '特拉梅里',
  Transinet: '全网物流',
  WGCC: '世界绿化',
  Stokes: '斯托克斯',
  BCP: '波罗的海石化',
  LKW: '德意志货运',
  'LKW Log': '德意志货运',
  Posped: '波兰速递',
  FCP: '法国化学',
  SellPlan: '超值平价',
  Steinbruch: '采石场',
  Vitas: '维塔斯能源',
  Scania: '斯堪尼亚',
  Volvo: '沃尔沃',
  Renault: '雷诺',
  MAN: '曼恩',
  DAF: '达夫',
  Iveco: '依维柯',
  Mercedes: '梅赛德斯',
}

/**
 * Localizes city name by checking map labels first, then CITY_ZH dictionary.
 */
export function resolveLocalizedCity(
  city: string | undefined,
  labels: readonly MapLabel[] | undefined,
  isZh: boolean,
): string {
  if (!city) return '--'
  if (labels && labels.length > 0) {
    const trimmed = city.trim().toLowerCase()
    const found = labels.find(
      (l) => l.kind === 'city' && (l.name.toLowerCase() === trimmed || l.localized?.toLowerCase() === trimmed),
    )
    if (found?.localized) {
      return isZh ? (CITY_ZH[found.name] ?? found.localized) : found.localized
    }
  }
  if (isZh) {
    return CITY_ZH[city] ?? city
  }
  return city
}

/** Localizes company name according to language. */
export function resolveLocalizedCompany(company: string | undefined, isZh: boolean): string {
  if (!company) return '--'
  if (!isZh) return company
  return COMPANY_ZH[company] ?? company
}

/** Calculates net payout considering damage deduction. */
export function calculateNetPayout(income: number, cargoDamage: number): number {
  if (income <= 0) return 0
  const damageFraction = Math.max(0, Math.min(1, cargoDamage))
  const deduction = Math.round(income * damageFraction)
  return Math.max(0, income - deduction)
}

/** Formats ETA arrival into localized header string, e.g. "Arrival Wed 19:49" or "预计到达 周三 19:49". */
export function formatArrivalTime(
  gameTime: number,
  navSeconds: number,
  clockShift: number,
  days: readonly string[],
  style: ClockStyle = HOURS_24,
  isZh = false,
): string {
  if (navSeconds <= 0 && gameTime <= 0) return '--'
  const navMinutes = Math.ceil(Math.max(0, navSeconds) / 60)
  const etaMinutes = gameTime + navMinutes + clockShift
  const dayIndex = Math.floor(etaMinutes / 1440) % 7
  const dayStr = days[dayIndex] ?? ''
  const timeStr = formatGameTime(etaMinutes, style)
  const isToday = Math.floor(etaMinutes / 1440) === Math.floor((gameTime + clockShift) / 1440)
  const dayPart = isToday ? '' : `${dayStr} `
  if (isZh) {
    return `预计到达 ${dayPart}${timeStr}`
  }
  return `Arrival ${dayPart}${timeStr}`
}

/** Formats next break subtext, e.g. "Rest area in Amsterdam · 67 km · 15:02". */
export function formatNextBreakLocation(
  cityName: string,
  distanceMeters: number,
  etaClockTime: string,
  isMph: boolean,
  isZh: boolean,
): string {
  const dist = isMph
    ? `${Math.round((distanceMeters / 1000) * 0.621371).toLocaleString()} mi`
    : `${Math.round(distanceMeters / 1000).toLocaleString()} km`
  if (isZh) {
    return `${cityName}服务区 · ${dist} · ${etaClockTime}`
  }
  return `Rest area in ${cityName} · ${dist} · ${etaClockTime}`
}

export interface BrandIdentity {
  /** Canonical normalized brand key (e.g. 'daf', 'scania', 'kenworth', 'custom'). */
  key: string
  /** Sculptural display wordmark (uppercased for Latin scripts, preserved for CJK). */
  wordmark: string
  /** Heritage signature accent for dark obsidian cockpit. */
  accentDark: string
  /** High-contrast heritage accent for light brushed aluminum cockpit. */
  accentLight: string
}

const BRAND_PALETTE: Readonly<Record<string, { accentDark: string; accentLight: string }>> = {
  // ETS2 flagship European makers
  daf: { accentDark: '#e63946', accentLight: '#c81e2b' },
  scania: { accentDark: '#3b82f6', accentLight: '#1d4ed8' },
  volvo: { accentDark: '#60a5fa', accentLight: '#1e40af' },
  mercedes: { accentDark: '#cbd5e1', accentLight: '#475569' },
  man: { accentDark: '#ef4444', accentLight: '#b91c1c' },
  renault: { accentDark: '#f43f5e', accentLight: '#be123c' },
  iveco: { accentDark: '#38bdf8', accentLight: '#0369a1' },
  // ATS flagship American makers
  peterbilt: { accentDark: '#ef4444', accentLight: '#b91c1c' },
  kenworth: { accentDark: '#f43f5e', accentLight: '#be123c' },
  freightliner: { accentDark: '#7dd3fc', accentLight: '#0284c7' },
  westernstar: { accentDark: '#f59e0b', accentLight: '#b45309' },
  mack: { accentDark: '#d97706', accentLight: '#92400e' },
  international: { accentDark: '#fb923c', accentLight: '#c2410c' },
}

const ATS_BRAND_MATCHERS: readonly { key: string; patterns: readonly string[] }[] = [
  { key: 'peterbilt', patterns: ['peterbilt'] },
  { key: 'kenworth', patterns: ['kenworth'] },
  { key: 'freightliner', patterns: ['freightliner'] },
  { key: 'westernstar', patterns: ['westernstar', 'western star', 'western_star'] },
  { key: 'mack', patterns: ['mack'] },
  { key: 'international', patterns: ['international', 'intnational'] },
]

const DEFAULT_BRAND_ACCENT = { accentDark: '#f5a623', accentLight: '#c77700' }

/**
 * Resolves a truck's brand into a canonical key, sculptural display wordmark,
 * and dual-appearance heritage accent colors across ETS2, ATS, and modded vehicles.
 */
export function resolveBrandIdentity(brandId: string, brand: string): BrandIdentity {
  const candidates = logoBrands(brandId, brand)
  let key = 'custom'

  for (const id of candidates) {
    const normalized = id.toLowerCase()
    if (BRAND_PALETTE[normalized]) {
      key = normalized
      break
    }
  }

  if (key === 'custom') {
    const combined = `${brandId} ${brand}`.toLowerCase()
    const words = combined.split(/[^a-z0-9]+/)
    for (const matcher of ATS_BRAND_MATCHERS) {
      if (matcher.patterns.some((p) => (p.includes(' ') || p.includes('_') ? combined.includes(p) : words.includes(p)))) {
        key = matcher.key
        break
      }
    }
  }

  const rawLabel = (brand || brandId || '').trim()
  const hasLatin = /[a-z]/i.test(rawLabel)
  const wordmark = rawLabel ? (hasLatin ? rawLabel.toUpperCase() : rawLabel) : '--'
  const palette = BRAND_PALETTE[key] ?? DEFAULT_BRAND_ACCENT

  return {
    key,
    wordmark,
    accentDark: palette.accentDark,
    accentLight: palette.accentLight,
  }
}

/** Formats currency consistently for metric (€, ETS2) and imperial ($, ATS). */
export function formatCurrency(amount: number, isMph: boolean): string {
  if (!Number.isFinite(amount)) return '--'
  const rounded = Math.round(amount)
  const negative = rounded < 0
  const absFormatted = Math.abs(rounded).toLocaleString()
  if (isMph) {
    return negative ? `-$${absFormatted}` : `$${absFormatted}`
  }
  return negative ? `-${absFormatted} €` : `${absFormatted} €`
}

export type WearPartId =
  | 'engine'
  | 'transmission'
  | 'cabin'
  | 'chassis'
  | 'wheels'
  | 'trailerBody'
  | 'trailerChassis'
  | 'trailerWheels'

export interface ValueUnitParts {
  value: string
  unit: string
}

/** Splits a formatted metric like "268 km" or "$18,450" into primary numeral and unit for instrument typography. */
export function splitValueUnit(formatted: string): ValueUnitParts {
  const trimmed = formatted.trim()
  if (!trimmed || trimmed === '--') return { value: '--', unit: '' }
  if (trimmed.startsWith('$') || trimmed.startsWith('-$')) {
    const sign = trimmed.startsWith('-') ? '-' : ''
    const rest = trimmed.slice(sign.length + 1)
    return { value: `${sign}${rest}`, unit: '$' }
  }
  const idx = trimmed.lastIndexOf(' ')
  if (idx <= 0) return { value: trimmed, unit: '' }
  return {
    value: trimmed.slice(0, idx),
    unit: trimmed.slice(idx + 1),
  }
}

/** Calculates unit rate earnings (€/km or $/mi). */
export function calculateRate(income: number, plannedKm: number, isMph: boolean): string {
  if (plannedKm <= 0 || income <= 0) return '--'
  const distance = isMph ? plannedKm * 0.621371 : plannedKm
  const rate = income / distance
  return rate.toFixed(1)
}

/** Formats cargo mass for display in metric tonnes/kg or imperial lbs. */
export function formatCargoMass(kg: number, isMph: boolean): string {
  if (kg <= 0) return '--'
  if (isMph) {
    const lbs = Math.round(kg * 2.20462)
    return `${lbs.toLocaleString()} lbs`
  }
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(1)} t`
  }
  return `${Math.round(kg)} kg`
}

/** Formats remaining game duration into localized days, hours, and minutes. */
export function formatDuration(totalMinutes: number, isZh: boolean): string {
  if (totalMinutes <= 0) return isZh ? '0 分钟' : '0 min'
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const mins = Math.floor(totalMinutes % 60)

  if (isZh) {
    if (days > 0) return `${days}天 ${hours}小时 ${mins}分`
    if (hours > 0) return `${hours}小时 ${mins}分`
    return `${mins}分钟`
  }
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins} min`
}

export type BufferStatus = 'ample' | 'tight' | 'late'

export interface BufferResult {
  bufferMinutes: number
  status: BufferStatus
  remainingText: string
  /** Safety margin ratio compared to route navigation time (0..1+). */
  bufferRatio: number
}

/**
 * Evaluates delivery time margin by comparing remaining deadline window
 * against active GPS navigation route time.
 */
export function evaluateBuffer(
  deliveryTime: number,
  gameTime: number,
  navTimeSeconds: number,
  isZh: boolean,
): BufferResult {
  const windowMinutes = deliveryTime - gameTime
  const navMinutes = Math.ceil(Math.max(0, navTimeSeconds) / 60)
  const bufferMinutes = windowMinutes - navMinutes

  let status: BufferStatus = 'ample'
  if (windowMinutes <= 0 || bufferMinutes < 0) {
    status = 'late'
  } else if (bufferMinutes <= 75) {
    status = 'tight'
  }

  const remainingText = formatDuration(Math.max(0, windowMinutes), isZh)
  const total = Math.max(1, navMinutes + Math.max(0, bufferMinutes))
  const bufferRatio = Math.max(0, Math.min(1, Math.max(0, bufferMinutes) / total))

  return { bufferMinutes, status, remainingText, bufferRatio }
}

export type WearGrade = 'good' | 'warn' | 'bad'

export interface ComponentWear {
  name: string
  fraction: number
  percentText: string
  grade: WearGrade
}

/** Evaluates component wear condition (0.0 = brand new, 1.0 = ruined). */
export function evaluateWear(name: string, rawFraction: number | undefined): ComponentWear {
  const fraction = Math.max(0, Math.min(1, rawFraction ?? 0))
  const percentText = `${(fraction * 100).toFixed(1)}%`
  let grade: WearGrade = 'good'
  if (fraction >= 0.2) {
    grade = 'bad'
  } else if (fraction >= 0.06) {
    grade = 'warn'
  }
  return { name, fraction, percentText, grade }
}

export type HosAdviceStatus = 'ok' | 'rest_soon' | 'overdue'

export const HOS_BREAK_TONES: Record<HosAdviceStatus, 'neutral' | 'warn' | 'bad'> = {
  ok: 'neutral',
  rest_soon: 'warn',
  overdue: 'bad',
}

export interface HosEvaluation {
  restDueMinutes: number
  restDueText: string
  fatiguePercent: number
  level: 'fresh' | 'normal' | 'tired'
  isOverdue: boolean
  adviceStatus: HosAdviceStatus
  needRestEnRoute: boolean
}

/** Evaluates driver HOS / fatigue status and generates smart rest advice. */
export function evaluateHos(nextRestStop: number | undefined, navTimeSeconds: number, isZh: boolean): HosEvaluation {
  const restDueMinutes = nextRestStop ?? 0
  const isOverdue = restDueMinutes <= 0
  // Standard max driving cycle: ~11h (660 min)
  const maxCycle = 660
  const fatigueRatio = Math.max(0, Math.min(1, (maxCycle - Math.max(0, restDueMinutes)) / maxCycle))
  const fatiguePercent = Math.round(fatigueRatio * 100)

  let level: 'fresh' | 'normal' | 'tired' = 'normal'
  if (restDueMinutes > 300) {
    level = 'fresh'
  } else if (restDueMinutes <= 90) {
    level = 'tired'
  }

  const navMinutes = Math.ceil(Math.max(0, navTimeSeconds) / 60)
  // Need rest if overdue, or remaining driving hours are insufficient for the route + 30 min safety buffer
  const adviceStatus: HosAdviceStatus = isOverdue
    ? 'overdue'
    : (navMinutes > 0 && restDueMinutes <= navMinutes + 30) || (navMinutes === 0 && restDueMinutes <= 90)
      ? 'rest_soon'
      : 'ok'
  const needRestEnRoute = adviceStatus !== 'ok'
  const restDueText = !isOverdue ? formatDuration(restDueMinutes, isZh) : isZh ? '已达上限' : 'Overdue'

  return {
    restDueMinutes,
    restDueText,
    fatiguePercent,
    level,
    isOverdue,
    adviceStatus,
    needRestEnRoute,
  }
}

export interface RouteProgress {
  progressRatio: number
  progressPercent: number
  distanceCoveredKm: number
  distanceRemainingKm: number
  plannedDistanceKm: number
  coveredText: string
  remainingText: string
  totalText: string
}

/**
 * Calculates current journey route progress percentage and dual odometer figures.
 */
export function calculateRouteProgress(
  plannedDistanceKm: number,
  navigationDistanceMeters: number | undefined,
  isMph: boolean,
): RouteProgress {
  const plannedMeters = Math.max(0, plannedDistanceKm * 1000)
  const navMeters = Math.max(0, navigationDistanceMeters ?? 0)
  const distanceRemainingKm = navMeters / 1000

  // Calculate covered distance
  const distanceCoveredMeters =
    plannedMeters > 0 && navMeters > 0 ? Math.max(0, Math.min(plannedMeters, plannedMeters - navMeters)) : 0
  const distanceCoveredKm = distanceCoveredMeters / 1000
  const progressRatio = plannedMeters > 0 ? distanceCoveredMeters / plannedMeters : 0
  const progressPercent = Math.round(progressRatio * 100)

  const distUnit = isMph ? 'mi' : 'km'
  const scale = isMph ? 0.621371 : 1
  const coveredText = `${Math.round(distanceCoveredKm * scale).toLocaleString()} ${distUnit}`
  const remainingText = navMeters > 0 ? `${Math.round(distanceRemainingKm * scale).toLocaleString()} ${distUnit}` : '--'
  const totalText = `${Math.round(plannedDistanceKm * scale).toLocaleString()} ${distUnit}`

  return {
    progressRatio,
    progressPercent,
    distanceCoveredKm,
    distanceRemainingKm,
    plannedDistanceKm,
    coveredText,
    remainingText,
    totalText,
  }
}

export interface JourneyTimeline {
  canDirectDeliver: boolean
  canDirectOnTime: boolean
  canDeliverAfterRest: boolean
  etaDirectMinutes: number
  etaWithRestMinutes: number
  restMarginMinutes: number
  simulatedRestMinutes: number
  restDueMinutes: number
  navMinutes: number
  windowMinutes: number
  /** Normalized ratios (0..1) for timeline segment visualization. */
  navRatio: number
  restRatio: number
  bufferRatio: number
}

/**
 * Simulates journey schedule with an optional 8-hour (480 min) tachograph rest stop.
 */
export function calculateJourneyTimeline(
  gameTime: number,
  navTimeSeconds: number,
  nextRestStop: number | undefined,
  deliveryTime: number,
): JourneyTimeline {
  const navMinutes = Math.ceil(Math.max(0, navTimeSeconds) / 60)
  const rawRestDue = nextRestStop ?? 0
  const restDueMinutes = Math.max(0, rawRestDue)
  const windowMinutes = Math.max(0, deliveryTime - gameTime)
  const simulatedRestMinutes = 480 // 8 hours standard rest

  const etaDirectMinutes = gameTime + navMinutes
  const etaWithRestMinutes = gameTime + navMinutes + simulatedRestMinutes
  const restMarginMinutes = deliveryTime - etaWithRestMinutes

  const canDirectDeliver = rawRestDue > 0 && restDueMinutes >= navMinutes
  const canDirectOnTime = deliveryTime - etaDirectMinutes >= 0
  const canDeliverAfterRest = restMarginMinutes >= 0

  let navRatio: number
  let restRatio: number
  let bufferRatio: number
  if (restMarginMinutes <= 0) {
    const tripWithRest = Math.max(navMinutes + simulatedRestMinutes, 1)
    navRatio = Math.min(0.82, Math.max(0.18, navMinutes / tripWithRest))
    restRatio = 1 - navRatio
    bufferRatio = 0
  } else {
    const totalHorizon = Math.max(windowMinutes, navMinutes + simulatedRestMinutes, 1)
    const minSeg = 0.08
    const n = Math.max(minSeg, navMinutes / totalHorizon)
    const r = Math.max(minSeg, simulatedRestMinutes / totalHorizon)
    const b = Math.max(minSeg, restMarginMinutes / totalHorizon)
    const sum = n + r + b
    navRatio = n / sum
    restRatio = r / sum
    bufferRatio = b / sum
  }

  return {
    canDirectDeliver,
    canDirectOnTime,
    canDeliverAfterRest,
    etaDirectMinutes,
    etaWithRestMinutes,
    restMarginMinutes,
    simulatedRestMinutes,
    restDueMinutes,
    navMinutes,
    windowMinutes,
    navRatio,
    restRatio,
    bufferRatio,
  }
}

export type OverallHealthRating = 'excellent' | 'good' | 'fair' | 'critical'

export interface OverallVehicleHealth {
  score: number // 0 to 100
  rating: OverallHealthRating
  maxWearComponent: string
  maxWearPercent: string
}

/**
 * Computes an executive composite vehicle health score from all component wear.
 */
export function calculateOverallHealth(
  truckItems: ComponentWear[],
  trailerItems: ComponentWear[],
): OverallVehicleHealth {
  const allItems = [...truckItems, ...trailerItems]
  if (allItems.length === 0) {
    return { score: 100, rating: 'excellent', maxWearComponent: '--', maxWearPercent: '0%' }
  }

  let totalWear = 0
  let maxWear = 0
  let maxComponent = allItems[0].name

  for (const item of allItems) {
    totalWear += item.fraction
    if (item.fraction > maxWear) {
      maxWear = item.fraction
      maxComponent = item.name
    }
  }

  const avgWear = totalWear / allItems.length
  // Score drops faster if a single critical component has high wear
  const penalty = Math.max(avgWear * 0.6, maxWear * 0.8)
  const score = Math.max(0, Math.min(100, Math.round((1 - penalty) * 100)))

  let rating: OverallHealthRating = 'excellent'
  if (score < 65 || maxWear >= 0.2) {
    rating = 'critical'
  } else if (score < 80 || maxWear >= 0.1) {
    rating = 'fair'
  } else if (score < 94 || maxWear >= 0.05) {
    rating = 'good'
  }

  return {
    score,
    rating,
    maxWearComponent: maxComponent,
    maxWearPercent: `${(maxWear * 100).toFixed(1)}%`,
  }
}

/**
 * Preview mode is enabled only outside the game host when explicitly requested via `?preview` or `?demo`.
 */
export function isPreviewMode(inHost: boolean, isDemo: boolean, search: string): boolean {
  if (inHost) return false
  if (isDemo) return true
  return new URLSearchParams(search).has('preview')
}

/** Formats remaining fuel in litres or US gallons. */
export function formatFuel(litres: number | undefined, isMph: boolean): string {
  if (litres === undefined || !Number.isFinite(litres) || litres < 0) return '--'
  if (isMph) {
    return `${Math.round(litres * 0.264172).toLocaleString()} gal`
  }
  return `${Math.round(litres).toLocaleString()} L`
}

/** Formats estimated fuel range in km or miles. */
export function formatFuelRange(km: number | undefined, isMph: boolean): string {
  if (km === undefined || !Number.isFinite(km) || km < 0) return '--'
  if (isMph) {
    return `${Math.round(km * 0.621371).toLocaleString()} mi`
  }
  return `${Math.round(km).toLocaleString()} km`
}

/**
 * Estimates visual fuel tank fill percentage (0 or clamped 4..100) from remaining litres or range.
 * SCS telemetry exposes fuel amount and range without tank capacity, so 900 L / 1800 km serves as reference.
 */
export function estimateFuelFillPercent(litres: number | undefined, rangeKm: number | undefined): number {
  if (litres !== undefined && Number.isFinite(litres) && litres > 0) {
    return Math.min(100, Math.max(4, Math.round((litres / 900) * 100)))
  }
  if (rangeKm !== undefined && Number.isFinite(rangeKm) && rangeKm > 0) {
    return Math.min(100, Math.max(4, Math.round((rangeKm / 1800) * 100)))
  }
  return 0
}

/** Returns true when remaining fuel range indicates a low-fuel warning (< 250 km). */
export function isLowFuel(rangeKm: number | undefined): boolean {
  return rangeKm !== undefined && Number.isFinite(rangeKm) && rangeKm > 0 && rangeKm < 250
}

/** Formats brake air tank pressure in bar (metric) or psi (imperial). */
export function formatAirPressure(psi: number | undefined, isMph: boolean): string {
  if (psi === undefined || !Number.isFinite(psi) || psi < 0) return '--'
  if (isMph) {
    return `${Math.round(psi)} psi`
  }
  return `${(psi * 0.0689476).toFixed(1)} bar`
}

/** Returns true when a trailer is coupled (active loaded cargo or reported trailer wear). */
export function isTrailerCoupled(telemetry: Telemetry | null, job: JobInfo | null): boolean {
  if (job?.active && job.cargoLoaded) return true
  if (!telemetry) return false
  return (
    (telemetry.wearTrailerChassis ?? 0) > 0 ||
    (telemetry.wearTrailerWheels ?? 0) > 0 ||
    (telemetry.wearTrailerBody ?? 0) > 0
  )
}

/** Builds deterministic demo telemetry, job, and truck data for `?preview` / `?demo` browser previews. */
export function createPreviewData(isZh: boolean): { job: JobInfo; telemetry: Telemetry; truck: TruckInfo } {
  const gameTime = 3780 // Wed 15:00
  return {
    truck: {
      brandId: 'daf',
      brand: 'DAF',
      id: 'vehicle.daf.2021',
      name: 'XG+ 530',
    },
    job: {
      active: true,
      cargoLoaded: true,
      special: false,
      cargo: isZh ? '酸奶' : 'Yogurt',
      cargoMass: 18200,
      sourceCity: 'Duisburg',
      sourceCompany: 'Kaarfor',
      destinationCity: 'Amsterdam',
      destinationCompany: 'Tree-ET',
      deliveryTime: gameTime + 510, // Wed 23:30
      plannedDistanceKm: 430,
      income: 18450,
    },
    telemetry: {
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      pitch: 0,
      roll: 0,
      speed: 22.2,
      engineRpm: 1240,
      gear: 12,
      displayedGear: 12,
      cruiseControlSpeed: 22.2,
      fuel: 685,
      fuelRange: 1420,
      navigationDistance: 268000,
      navigationTime: 11280, // 3h 08m
      navigationSpeedLimit: 22.2,
      gameTime,
      multiplayerTimeOffset: 0,
      localScale: 1,
      dashboardBacklight: 0.8,
      electricEnabled: true,
      engineEnabled: true,
      parkingBrake: false,
      lowBeam: false,
      highBeam: false,
      leftBlinker: false,
      rightBlinker: false,
      paused: false,
      nextRestStop: 312, // 5h 12m
      cargoDamage: 0.01,
      wearEngine: 0.024,
      wearTransmission: 0.015,
      wearCabin: 0.008,
      wearChassis: 0.032,
      wearWheels: 0.068,
      wearTrailerChassis: 0.014,
      wearTrailerWheels: 0.042,
      wearTrailerBody: 0.011,
      brakeAirPressure: 124,
      brakeAirPressureWarning: false,
    },
  }
}
