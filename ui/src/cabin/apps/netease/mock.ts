import type { NeteasePlaylist, NeteaseTrack } from '../../../shared/host'
import type { UserProfile } from './netease'

export interface NeteaseCategory {
  id: string
  name: string
  kind: 'brand' | 'genre'
}

export const DISCOVER_CATEGORIES: NeteaseCategory[] = [
  { id: '3778678', name: '推荐', kind: 'brand' },
  { id: '19723756', name: '官方', kind: 'brand' },
  { id: '2884035', name: '华语', kind: 'genre' },
  { id: '2809513713', name: '欧美', kind: 'genre' },
  { id: '3779629', name: '流行', kind: 'genre' },
  { id: 'rock', name: '摇滚', kind: 'genre' },
  { id: 'folk', name: '民谣', kind: 'genre' },
  { id: '1978921795', name: '电音', kind: 'genre' },
]

export const CHARTS = DISCOVER_CATEGORIES

export const HOT_SEARCH_TAGS = ['周杰伦', '起风了', '平凡之路', '车载摇滚', '经典民谣', '粤语老歌', '电音慢摇'] as const

export const PREVIEW_USER_PROFILE: UserProfile = {
  nickname: '车载预览',
  vipType: 11,
}

export const MOCK_TRACKS: NeteaseTrack[] = [
  {
    id: '186016',
    title: '晴天',
    artist: '周杰伦',
    album: '叶惠美',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 269,
    fee: 0,
    playable: false,
  },
  {
    id: '1413585838',
    title: '迷恋',
    artist: '梅卡德尔',
    album: '狗叫空间',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 215,
    fee: 1,
    playable: true,
  },
  {
    id: '347230',
    title: '海阔天空',
    artist: 'Beyond',
    album: '乐与怒',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 326,
    fee: 1,
    playable: true,
  },
  {
    id: '1330348068',
    title: '起风了',
    artist: '买辣椒也用券',
    album: '起风了',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 325,
    fee: 8,
    playable: true,
  },
  {
    id: '28815250',
    title: '平凡之路',
    artist: '朴树',
    album: '猎户星座',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 301,
    fee: 1,
    playable: true,
  },
  {
    id: '185906',
    title: '夜曲',
    artist: '周杰伦',
    album: '十一月的萧邦',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 226,
    fee: 0,
    playable: false,
  },
  {
    id: '1901371647',
    title: '漠河舞厅',
    artist: '柳爽',
    album: '1st.星球',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 312,
    fee: 1,
    playable: true,
  },
]

export const MOCK_RECOMMENDED_PLAYLISTS: NeteasePlaylist[] = [
  {
    id: '3778678',
    name: '云音乐热歌榜 · 实时精选',
    coverImgUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
    trackCount: 200,
    playCount: 1845000,
  },
  {
    id: '19723756',
    name: '云音乐飙升榜 · 全网热播',
    coverImgUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80',
    trackCount: 100,
    playCount: 923000,
  },
  {
    id: '8877118200',
    name: '车载重低音 · 长途提神专属',
    coverImgUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
    trackCount: 60,
    playCount: 409300,
  },
  {
    id: '2298267009',
    name: '公路民谣 · 属于行者的故事',
    coverImgUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
    trackCount: 93,
    playCount: 5679866,
  },
  {
    id: '5460985377',
    name: '经典欧美摇滚 · 蓝调律动',
    coverImgUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=400&q=80',
    trackCount: 69,
    playCount: 1408414,
  },
  {
    id: '2884035',
    name: '云音乐原创榜 · 独立新声',
    coverImgUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=400&q=80',
    trackCount: 100,
    playCount: 624492,
  },
]

export const DEFAULT_USER_PLAYLISTS: NeteasePlaylist[] = [
  {
    id: 'user_liked',
    name: '我喜欢的音乐',
    coverImgUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
    trackCount: 7,
    playCount: 1280,
    subscribed: false,
  },
  {
    id: 'user_car_fav',
    name: '车载精选私藏',
    coverImgUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=400&q=80',
    trackCount: 5,
    playCount: 420,
    subscribed: false,
  },
  {
    id: 'user_highway',
    name: '公路自驾经典电台',
    coverImgUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
    trackCount: 5,
    playCount: 890,
    subscribed: true,
  },
  {
    id: 'user_night_drive',
    name: '深夜漫摇微醺',
    coverImgUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
    trackCount: 4,
    playCount: 630,
    subscribed: true,
  },
]

export const ROCK_TRACKS: NeteaseTrack[] = [
  {
    id: '4010201',
    title: 'Hotel California',
    artist: 'Eagles',
    album: 'Hotel California',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 391,
  },
  {
    id: '3448738711',
    title: '无意',
    artist: '加木, Demxntia',
    album: '无意',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 176,
  },
  {
    id: '1393666',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night At The Opera',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 354,
  },
  {
    id: '3986241',
    title: "Sweet Child O' Mine",
    artist: "Guns N' Roses",
    album: 'Appetite For Destruction',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 356,
  },
  {
    id: '16343516',
    title: 'In The End',
    artist: 'Linkin Park',
    album: 'Hybrid Theory',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    duration: 216,
  },
  {
    id: '4466775',
    title: "It's My Life",
    artist: 'Bon Jovi',
    album: 'Crush',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 224,
  },
  {
    id: '16343528',
    title: 'Numb',
    artist: 'Linkin Park',
    album: 'Meteora',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 187,
  },
  {
    id: '418603099',
    title: 'Back In Black',
    artist: 'AC/DC',
    album: 'Back In Black',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 255,
  },
]

export const FOLK_TRACKS: NeteaseTrack[] = [
  {
    id: '1901371647',
    title: '漠河舞厅',
    artist: '柳爽',
    album: '1st.星球',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 312,
  },
  {
    id: '28815250',
    title: '平凡之路',
    artist: '朴树',
    album: '猎户星座',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 301,
  },
  {
    id: '1330348068',
    title: '起风了',
    artist: '买辣椒也用券',
    album: '起风了',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 325,
  },
  {
    id: '347230',
    title: '海阔天空',
    artist: 'Beyond',
    album: '乐与怒',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 326,
  },
]

export const CAR_FAV_TRACKS: NeteaseTrack[] = [
  {
    id: '27955653',
    title: '夜空中最亮的星',
    artist: '逃跑计划',
    album: '世界',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 252,
  },
  {
    id: '436514312',
    title: '成都',
    artist: '赵雷',
    album: '无法长大',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 328,
  },
  {
    id: '346089',
    title: '光辉岁月',
    artist: 'Beyond',
    album: '命运派对',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 299,
  },
  {
    id: '569200213',
    title: '像我这样的人',
    artist: '毛不易',
    album: '平凡的一天',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 169,
  },
  {
    id: '167827',
    title: '蓝莲花',
    artist: '许巍',
    album: '时光·漫步',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 270,
  },
]

export const HIGHWAY_TRACKS: NeteaseTrack[] = [
  {
    id: '167876',
    title: '曾经的你',
    artist: '许巍',
    album: '每一刻都是崭新的',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 263,
  },
  {
    id: '29814898',
    title: '南山南',
    artist: '马頔',
    album: '孤岛',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 324,
  },
  {
    id: '31445772',
    title: '理想三旬',
    artist: '陈鸿宇',
    album: '浓烟下的诗歌电台',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 211,
  },
  {
    id: '27646205',
    title: '安和桥',
    artist: '宋冬野',
    album: '安和桥北',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 250,
  },
  {
    id: '29732992',
    title: '去大理',
    artist: '郝云',
    album: '心花路放 电影原声带',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 247,
  },
]

export const EDM_TRACKS: NeteaseTrack[] = [
  {
    id: '4010202',
    title: 'Faded',
    artist: 'Alan Walker',
    album: 'Faded',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    duration: 212,
  },
  {
    id: '4010203',
    title: 'The Spectre',
    artist: 'Alan Walker',
    album: 'The Spectre',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 193,
  },
  {
    id: '442869203',
    title: 'Alone',
    artist: 'Alan Walker',
    album: 'Alone',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 161,
  },
  {
    id: '461347998',
    title: 'Something Just Like This',
    artist: 'The Chainsmokers, Coldplay',
    album: 'Memories...Do Not Open',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    duration: 247,
  },
]

export const SOARING_TRACKS: NeteaseTrack[] = [
  {
    id: '1842025914',
    title: '悬溺',
    artist: '葛东琪',
    album: '第二街区',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 197,
  },
  {
    id: '1496089152',
    title: '精卫',
    artist: '30年前，50年后',
    album: '精卫',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 245,
  },
  {
    id: '1407551413',
    title: '世间美好与你环环相扣',
    artist: '柏松',
    album: '听闻余生',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 191,
  },
  {
    id: '1813926556',
    title: '星辰大海',
    artist: '黄霄雲',
    album: '星辰大海',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 207,
  },
]

export const ORIGINAL_TRACKS: NeteaseTrack[] = [
  {
    id: '1398663411',
    title: '山雀',
    artist: '万能青年旅店',
    album: '冀西南林路行',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 263,
  },
  {
    id: '1959528822',
    title: '如果爱忘了',
    artist: '汪苏泷, 单依纯',
    album: '如果爱忘了',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 238,
  },
  {
    id: '1858118347',
    title: '孤勇者',
    artist: '陈奕迅',
    album: '孤勇者',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    duration: 256,
  },
  {
    id: '2026224214',
    title: '奢香夫人',
    artist: '凤凰传奇',
    album: '最炫民族风',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 261,
  },
]

const FALLBACK_POOLS: NeteaseTrack[][] = [
  CAR_FAV_TRACKS,
  HIGHWAY_TRACKS,
  ROCK_TRACKS,
  EDM_TRACKS,
  SOARING_TRACKS,
  ORIGINAL_TRACKS,
  MOCK_TRACKS,
]

export function getFallbackTracksForPlaylist(playlist: NeteasePlaylist): NeteaseTrack[] {
  const name = (playlist.name || '').toLowerCase()
  const id = playlist.id || ''
  if (id === 'user_liked' || id === '3778678') return MOCK_TRACKS
  if (id === 'user_car_fav') return CAR_FAV_TRACKS
  if (id === 'user_highway' || id === '2298267009') return HIGHWAY_TRACKS
  if (id === 'user_night_drive' || id === '8877118200') return EDM_TRACKS
  if (id === '19723756') return SOARING_TRACKS
  if (id === '5460985377') return ROCK_TRACKS
  if (id === '2884035') return ORIGINAL_TRACKS
  if (name.includes('喜欢') || name.includes('红心')) return MOCK_TRACKS
  if (name.includes('飙升')) return SOARING_TRACKS
  if (name.includes('原创')) return ORIGINAL_TRACKS
  if (name.includes('摇滚') || name.includes('rock') || name.includes('欧美') || name.includes('经典欧美')) {
    return ROCK_TRACKS
  }
  if (name.includes('民谣') || name.includes('folk')) return FOLK_TRACKS
  if (name.includes('公路') || name.includes('自驾') || name.includes('电台')) return HIGHWAY_TRACKS
  if (name.includes('私藏') || name.includes('车载精选')) return CAR_FAV_TRACKS
  if (
    name.includes('重低音') ||
    name.includes('电音') ||
    name.includes('edm') ||
    name.includes('深夜') ||
    name.includes('微醺')
  ) {
    return EDM_TRACKS
  }
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return FALLBACK_POOLS[Math.abs(hash) % FALLBACK_POOLS.length]
}
