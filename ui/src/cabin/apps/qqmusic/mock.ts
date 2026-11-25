import type { QqmusicArtist, QqmusicPlaylist, QqmusicRadio, QqmusicTrack } from '../../../shared/host'
import type { UserProfile } from './qqmusic'

export interface QqmusicCategory {
  id: string
  name: string
  kind: 'brand' | 'genre'
}

export const DISCOVER_CATEGORIES: QqmusicCategory[] = [
  { id: '26', name: '热歌榜', kind: 'brand' },
  { id: '62', name: '飙升榜', kind: 'brand' },
  { id: '27', name: '新歌榜', kind: 'brand' },
  { id: '4', name: '流行指数', kind: 'brand' },
  { id: '5', name: '内地榜', kind: 'genre' },
  { id: '3', name: '欧美榜', kind: 'genre' },
  { id: '58', name: '说唱榜', kind: 'genre' },
  { id: '57', name: '电音榜', kind: 'genre' },
  { id: '29', name: '影视金曲', kind: 'genre' },
  { id: '72', name: '动漫音乐', kind: 'genre' },
]

export const CHARTS = DISCOVER_CATEGORIES

export const HOT_SEARCH_TAGS = ['周杰伦', '林俊杰', '陈奕迅', '车载流行', '经典粤语', '公路民谣', '节奏电音'] as const

export const PREVIEW_USER_PROFILE: UserProfile = {
  nickname: '车载预览',
  vipType: 2,
}

export const MOCK_LYRICS_LRC = `[ti:晴天]
[ar:周杰伦]
[al:叶惠美]
[00:00.00]晴天 - 周杰伦
[00:08.50]故事的小黄花
[00:13.20]从出生那年就飘着
[00:18.40]童年的荡秋千
[00:23.10]随记忆一直晃到现在
[00:28.80]Re So So Si Do Si La
[00:33.50]So La Si Si Si Si La Si La So
[00:38.20]吹着前奏望着天空
[00:43.00]我想起花瓣试着掉落
[00:56.00]为你翘课的那一天
[01:00.80]花落的那一天
[01:05.50]教室的那一间
[01:10.20]我怎么看不见
[01:15.00]消失的下雨天
[01:19.60]我好想再淋一遍`

export const MOCK_TRACKS: QqmusicTrack[] = [
  {
    id: '0039MnYb0qxYhV',
    songId: '97773',
    mediaMid: '0039MnYb0qxYhV',
    title: '晴天',
    artist: '周杰伦',
    album: '叶惠美',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 269,
    payPlay: 1,
    playable: true,
  },
  {
    id: '001Qu4I30eVFYb',
    songId: '102065756',
    mediaMid: '001Qu4I30eVFYb',
    title: '不为谁而作的歌',
    artist: '林俊杰',
    album: '和自己对话',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 265,
    payPlay: 1,
    playable: true,
  },
  {
    id: '004Z8Ihr0JIu5s',
    songId: '97744',
    mediaMid: '004Z8Ihr0JIu5s',
    title: '富士山下',
    artist: '陈奕迅',
    album: "What's Going On...?",
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 259,
    payPlay: 0,
    playable: true,
  },
  {
    id: '002CWu3X3rP5yP',
    songId: '212877900',
    mediaMid: '002CWu3X3rP5yP',
    title: '起风了',
    artist: '买辣椒也用券',
    album: '起风了',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 325,
    payPlay: 0,
    playable: true,
  },
  {
    id: '003aAYrm3GE0Ac',
    songId: '101369814',
    mediaMid: '003aAYrm3GE0Ac',
    title: '稻香',
    artist: '周杰伦',
    album: '魔杰座',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 223,
    payPlay: 1,
    playable: true,
  },
  {
    id: '000xdZuV2LcQ19',
    songId: '4962990',
    mediaMid: '000xdZuV2LcQ19',
    title: '平凡之路',
    artist: '朴树',
    album: '猎户星座',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 301,
    payPlay: 0,
    playable: true,
  },
]

export const MOCK_RECOMMENDED_PLAYLISTS: QqmusicPlaylist[] = [
  {
    id: 'qqm_rec_hot',
    name: '巅峰热歌 · 驾驶室精选',
    coverImgUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
    trackCount: 100,
    playCount: 2560000,
  },
  {
    id: 'qqm_rec_soar',
    name: '巅峰飙升 · 实时全网热度',
    coverImgUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80',
    trackCount: 80,
    playCount: 1380000,
  },
  {
    id: 'qqm_rec_highway',
    name: '高速巡航 · 节奏流行不犯困',
    coverImgUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
    trackCount: 60,
    playCount: 892000,
  },
  {
    id: 'qqm_rec_night',
    name: '深夜国道 · 温柔粤语与民谣',
    coverImgUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
    trackCount: 54,
    playCount: 1720000,
  },
  {
    id: 'qqm_rec_edm',
    name: '车载律动 · 电子合成器能量',
    coverImgUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=400&q=80',
    trackCount: 48,
    playCount: 645000,
  },
  {
    id: 'qqm_rec_ost',
    name: '银幕回响 · 热门影视原声带',
    coverImgUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=400&q=80',
    trackCount: 72,
    playCount: 1120000,
  },
]

export const DEFAULT_USER_PLAYLISTS: QqmusicPlaylist[] = [
  {
    id: 'user_liked',
    name: '我喜欢',
    coverImgUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
    trackCount: 6,
    playCount: 1280,
    subscribed: false,
  },
  {
    id: 'user_drive',
    name: '卡车长途必备歌单',
    coverImgUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=400&q=80',
    trackCount: 4,
    playCount: 620,
    subscribed: false,
  },
  {
    id: 'user_collected_canto',
    name: '港乐黄金年代珍藏',
    coverImgUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
    trackCount: 4,
    playCount: 34200,
    subscribed: true,
  },
]

export const MOCK_RADIOS: QqmusicRadio[] = [
  {
    id: 'radio_101',
    name: '车载畅听电台',
    picUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
    djName: '场景',
    programCount: 30,
    subCount: 1850000,
  },
  {
    id: 'radio_102',
    name: '热歌随心听',
    picUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80',
    djName: '热门',
    programCount: 30,
    subCount: 3120000,
  },
  {
    id: 'radio_103',
    name: '深夜驾驶舒缓',
    picUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
    djName: '心情',
    programCount: 30,
    subCount: 920000,
  },
  {
    id: 'radio_104',
    name: '经典华语老歌',
    picUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=400&q=80',
    djName: '年代',
    programCount: 30,
    subCount: 1460000,
  },
  {
    id: 'radio_105',
    name: '欧美流行节奏',
    picUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
    djName: '曲风',
    programCount: 30,
    subCount: 780000,
  },
  {
    id: 'radio_106',
    name: '轻音乐减压时光',
    picUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=400&q=80',
    djName: '专注',
    programCount: 30,
    subCount: 610000,
  },
]

export const DEFAULT_USER_ARTISTS: QqmusicArtist[] = [
  {
    id: 'artist_jay',
    name: '周杰伦',
    picUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80',
    albumSize: 36,
    musicSize: 320,
  },
  {
    id: 'artist_jj',
    name: '林俊杰',
    picUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
    albumSize: 28,
    musicSize: 265,
  },
  {
    id: 'artist_eason',
    name: '陈奕迅',
    picUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=400&q=80',
    albumSize: 45,
    musicSize: 410,
  },
]

const DRIVE_TRACKS: QqmusicTrack[] = [
  {
    id: 'qqm_drv_1',
    title: '夜曲',
    artist: '周杰伦',
    album: '十一月的萧邦',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 226,
    payPlay: 1,
    playable: true,
  },
  {
    id: 'qqm_drv_2',
    title: '光辉岁月',
    artist: 'Beyond',
    album: '命运派对',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 300,
    payPlay: 0,
    playable: true,
  },
  {
    id: 'qqm_drv_3',
    title: '蓝莲花',
    artist: '许巍',
    album: '时光·漫步',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 270,
    payPlay: 0,
    playable: true,
  },
  {
    id: 'qqm_drv_4',
    title: '曾经的你',
    artist: '许巍',
    album: '每一刻都是崭新的',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 261,
    payPlay: 0,
    playable: true,
  },
]

const CANTO_TRACKS: QqmusicTrack[] = [
  {
    id: 'qqm_canto_1',
    title: '海阔天空',
    artist: 'Beyond',
    album: '乐与怒',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    duration: 326,
    payPlay: 0,
    playable: true,
  },
  {
    id: 'qqm_canto_2',
    title: 'K歌之王',
    artist: '陈奕迅',
    album: '打得火热',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 222,
    payPlay: 1,
    playable: true,
  },
  {
    id: 'qqm_canto_3',
    title: '月半小夜曲',
    artist: '李克勤',
    album: '命运符号',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 294,
    payPlay: 0,
    playable: true,
  },
  {
    id: 'qqm_canto_4',
    title: '喜欢你',
    artist: 'Beyond',
    album: '秘密警察',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 274,
    payPlay: 0,
    playable: true,
  },
]

const WESTERN_TRACKS: QqmusicTrack[] = [
  {
    id: 'qqm_west_1',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    duration: 200,
    payPlay: 1,
    playable: true,
  },
  {
    id: 'qqm_west_2',
    title: 'Hotel California',
    artist: 'Eagles',
    album: 'Hotel California',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 391,
    payPlay: 0,
    playable: true,
  },
  {
    id: 'qqm_west_3',
    title: 'Faded',
    artist: 'Alan Walker',
    album: 'Different World',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 212,
    payPlay: 0,
    playable: true,
  },
]

const FALLBACK_POOLS: QqmusicTrack[][] = [MOCK_TRACKS, DRIVE_TRACKS, CANTO_TRACKS, WESTERN_TRACKS]

export function getFallbackTracksForPlaylist(playlist: QqmusicPlaylist): QqmusicTrack[] {
  if (playlist.id === 'user_liked' || playlist.id === 'qqm_rec_hot') return MOCK_TRACKS
  if (playlist.id === 'user_drive' || playlist.id === 'qqm_rec_highway') return DRIVE_TRACKS
  if (playlist.id === 'user_collected_canto' || playlist.id === 'qqm_rec_night') return CANTO_TRACKS
  if (playlist.id === 'qqm_rec_edm') return WESTERN_TRACKS
  let hash = 0
  for (let i = 0; i < playlist.id.length; i++) hash = (hash * 31 + playlist.id.charCodeAt(i)) >>> 0
  return FALLBACK_POOLS[hash % FALLBACK_POOLS.length]
}

export function getFallbackTracksForRadio(radio: QqmusicRadio): QqmusicTrack[] {
  if (radio.id === 'radio_101') return DRIVE_TRACKS
  if (radio.id === 'radio_104') return CANTO_TRACKS
  if (radio.id === 'radio_105') return WESTERN_TRACKS
  return MOCK_TRACKS
}

export function getFallbackTracksForArtist(artist: QqmusicArtist): QqmusicTrack[] {
  const matched = [...MOCK_TRACKS, ...DRIVE_TRACKS, ...CANTO_TRACKS].filter((t) => t.artist.includes(artist.name))
  return matched.length > 0 ? matched : MOCK_TRACKS
}
