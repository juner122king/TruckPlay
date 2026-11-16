import { useMemo } from 'react'
import { create } from 'zustand'
import {
  isInHost,
  postToHost,
  type XimalayaAlbum,
  type XimalayaCommand,
  type XimalayaPlayback,
  type XimalayaTrack,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'
import { receiveRadioAnswer, cancelRadioRequests } from '../radio/api'

export type XimalayaTab = 'featured' | 'xiangsheng' | 'story' | 'radio' | 'search' | 'my'
export type PlaybackSpeed = 1.0 | 1.25 | 1.5 | 1.75 | 2.0

export interface ExtendedXimalayaAlbum extends XimalayaAlbum {
  episodeCount?: number
  playCount?: string
  tag?: string
  category?: string
  completed?: boolean
}

export interface ExtendedXimalayaTrack extends XimalayaTrack {
  albumId?: string
  episodeNumber?: number
}

export interface XimalayaState {
  liveQueue: ExtendedXimalayaTrack[]
  sessionRequestId: number | null
  /** Selected target withheld from the host while game or power controls pause it. */
  pendingPlaybackTrack: ExtendedXimalayaTrack | null
  signedIn: boolean | null
  signingIn: boolean
  playing: boolean | null
  tab: XimalayaTab
  loading: boolean
  tracks: ExtendedXimalayaTrack[]
  albums: ExtendedXimalayaAlbum[]
  selectedAlbum: ExtendedXimalayaAlbum | null
  albumTracks: ExtendedXimalayaTrack[]
  playback: (XimalayaPlayback & { at: number; albumId?: string; speed?: number }) | null
  nowPlaying: boolean
  volume: number
  playbackSpeed: PlaybackSpeed
  sleepTimerMinutes: number | null
  sleepTimerEndsAt: number | null
  queue: ExtendedXimalayaTrack[]
  queueIndex: number
  queueOpen: boolean
  searchQuery: string
  searchResults: ExtendedXimalayaTrack[]
  searching: boolean
  favorites: ExtendedXimalayaAlbum[]
  history: ExtendedXimalayaTrack[]
  pendingPlayAlbumId?: string | null
  pendingPlayStartIndex?: number | null
}

const IN_HOST = typeof window !== 'undefined' && isInHost()

/* ==========================================================================
   Curated Chinese Audio Mock Catalog (喜马拉雅精品有声库)
   ========================================================================== */

export const MOCK_FEATURED_ALBUMS: ExtendedXimalayaAlbum[] = [
  {
    id: 'xm-feat-1',
    title: '《三体》全集广播剧（729声工场）',
    artist: '729声工场 / 刘慈欣原著',
    artwork:
      'https://imagev2.xmcdn.com/group47/M00/F4/A9/wKgKk1uq7ULyA3KDAAJR1e-qlp4786.jpg!op_type=3&columns=640&rows=640',
    description:
      '喜马拉雅独家打造，中国科幻史诗巨制！阿杰、季冠霖、乔诗语等超百位配音演员倾情献声，杜比全景声沉浸式音效，重温红岸基地与宇宙闪烁的震撼时刻。',
    episodeCount: 78,
    playCount: '15.6亿',
    tag: '全网力荐',
    category: '科幻有声剧',
    completed: true,
  },
  {
    id: 'xm-feat-2',
    title: '郭德纲于谦 相声十年经典珍藏',
    artist: '郭德纲 / 于谦 / 德云社',
    artwork:
      'https://imagev2.xmcdn.com/group44/M08/78/06/wKgKjFsiMLjCKlj9AAGZacd4740666.jpg!op_type=5&upload_type=album&device_type=ios&name=mobile_large&magick=png',
    description:
      '长途货运解乏第一神作！精选郭德纲于谦红楼梦、大福寿全、托妻献子等经典名段，百听不厌，专治疲劳驾驶与沉闷长夜。',
    episodeCount: 120,
    playCount: '38.2亿',
    tag: '长途必备',
    category: '相声名作',
    completed: true,
  },
  {
    id: 'xm-feat-3',
    title: '《明朝那些事儿》当年明月原著典藏版',
    artist: '当年明月 原著 / 喜马主播团',
    artwork:
      'https://imagev2.xmcdn.com/group44/M0A/37/F3/wKgKkVs1dcew-QnXAAGvU_jG07k576.jpg!op_type=3&columns=640&rows=640',
    description:
      '白话历史开山鼻祖！从朱元璋讨饭起家到崇祯煤山殉国，用幽默通俗的语言剖析三百年明朝兴衰史，热血与智慧并存。',
    episodeCount: 96,
    playCount: '9.4亿',
    tag: '历史巨著',
    category: '人文历史',
    completed: true,
  },
  {
    id: 'xm-feat-4',
    title: '深夜车载电台：伴你漫漫长夜驾驶',
    artist: '晚安公路 / 喜马车电台',
    artwork:
      'https://imagev2.xmcdn.com/group45/M07/58/B6/wKgKlFs5nZCSyU7yAAEv_J32Z-Q438.jpg!op_type=3&columns=640&rows=640',
    description: '写给每一个夜行卡车司机的声音树洞。温情民谣、老歌杂谈、行车平安故事，在静谧深夜给你最贴心的陪伴。',
    episodeCount: 65,
    playCount: '4.8亿',
    tag: '深夜暖心',
    category: '车载电台',
    completed: false,
  },
]

export const MOCK_XIANGSHENG_ALBUMS: ExtendedXimalayaAlbum[] = [
  {
    id: 'xm-xs-1',
    title: '郭德纲于谦 爆笑相声精选百场',
    artist: '德云社 郭德纲 / 于谦',
    artwork:
      'https://imagev2.xmcdn.com/group44/M08/78/06/wKgKjFsiMLjCKlj9AAGZacd4740666.jpg!op_type=5&upload_type=album&device_type=ios&name=mobile_large&magick=png',
    description: '德云社掌门人与相声皇后经典对口专场，包含论相声五十年之现状、西征梦、白事会等神作。',
    episodeCount: 100,
    playCount: '24.1亿',
    tag: '百听不厌',
    category: '相声',
    completed: true,
  },
  {
    id: 'xm-xs-2',
    title: '岳云鹏孙越 相声名场面全集',
    artist: '岳云鹏 / 孙越',
    artwork:
      'https://imagev2.xmcdn.com/group46/M08/21/5B/wKgKj1trjK7iKjD9AAGtJqB2n5M112.jpg!op_type=3&columns=640&rows=640',
    description: '五环之歌、我要幸福、学歌曲、造厨，小岳岳与孙越爆笑搭档，长途跑车快乐源泉。',
    episodeCount: 80,
    playCount: '16.7亿',
    tag: '爆笑解乏',
    category: '相声',
    completed: true,
  },
  {
    id: 'xm-xs-3',
    title: '单田芳经典评书《白眉大侠》全本',
    artist: '单田芳 评书大师',
    artwork:
      'https://imagev2.xmcdn.com/group48/M08/11/4C/wKgKlVvI0W2QpQY3AAGrN131LqE429.jpg!op_type=3&columns=640&rows=640',
    description: '刀光剑影开封府，细脖大头鬼房书安、白眉大侠徐良！单老独门沙哑嗓音，重现三侠五义续书江湖风云。',
    episodeCount: 320,
    playCount: '18.9亿',
    tag: '评书宗师',
    category: '经典评书',
    completed: true,
  },
  {
    id: 'xm-xs-4',
    title: '袁阔成评书《三国演义》纯音频版',
    artist: '袁阔成 先生',
    artwork:
      'https://imagev2.xmcdn.com/group45/M0A/69/8E/wKgKlFs_G0Tj8947AAGY_gO1k34889.jpg!op_type=3&columns=640&rows=640',
    description: '古今多少事，都付笑谈中。评书泰斗袁老一人演活魏蜀吴群雄，舌战群儒、火烧赤壁入木三分。',
    episodeCount: 365,
    playCount: '11.2亿',
    tag: '国宝评书',
    category: '经典评书',
    completed: true,
  },
  {
    id: 'xm-xs-5',
    title: '刘兰芳评书《岳飞传》大连版精编',
    artist: '刘兰芳 先生',
    artwork:
      'https://imagev2.xmcdn.com/group44/M01/2A/77/wKgKjFsiKzODc3PqAAGp1y-nQe4242.jpg!op_type=3&columns=640&rows=640',
    description: '金戈铁马，精忠报国！八宝驼龙枪挑小梁王，爱国名将岳鹏举浩气长存。',
    episodeCount: 110,
    playCount: '8.1亿',
    tag: '千古忠魂',
    category: '经典评书',
    completed: true,
  },
]

export const MOCK_STORY_ALBUMS: ExtendedXimalayaAlbum[] = [
  {
    id: 'xm-st-1',
    title: '《鬼吹灯全八部》周建龙原声大碟',
    artist: '天下霸唱 原著 / 周建龙 播讲',
    artwork:
      'https://imagev2.xmcdn.com/group45/M00/3E/2E/wKgKjFs_FzLSm6fCAAFw4kE1z2E341.jpg!op_type=3&columns=640&rows=640',
    description: '盗墓小说开山始祖！周建龙苍凉神秘的散文诗式演播，带你走进精绝古城、龙岭迷窟、云南虫谷的惊险世界。',
    episodeCount: 280,
    playCount: '29.3亿',
    tag: '盗墓鼻祖',
    category: '悬疑探险',
    completed: true,
  },
  {
    id: 'xm-st-2',
    title: '《盗墓笔记》大结局典藏广播剧',
    artist: '南派三叔 原著 / 喜马声工场',
    artwork:
      'https://imagev2.xmcdn.com/group46/M01/87/42/wKgKkFtx-KTR9-nEAAEvqG4M4wY723.jpg!op_type=3&columns=640&rows=640',
    description: '十年之约，青铜门后！吴邪、闷油瓶、王胖子铁三角的终极探秘之旅。',
    episodeCount: 210,
    playCount: '19.8亿',
    tag: '盗墓经典',
    category: '悬疑探险',
    completed: true,
  },
  {
    id: 'xm-st-3',
    title: '《凡人修仙传》仙侠修真史诗巨作',
    artist: '忘语 原著 / 大音希声 播讲',
    artwork:
      'https://imagev2.xmcdn.com/group47/M04/9E/35/wKgKm1ur7U6CKn36AAGQ0c1iNqQ234.jpg!op_type=3&columns=640&rows=640',
    description: '山村穷小子韩立步步为营的凡人修仙路。杀人放火厉飞雨，万人敬仰韩天尊！长途长途听书极度耐听。',
    episodeCount: 450,
    playCount: '31.5亿',
    tag: '修仙神作',
    category: '仙侠修真',
    completed: false,
  },
  {
    id: 'xm-st-4',
    title: '《大奉打更人》高武仙侠爆笑探案',
    artist: '卖报小郎君 原著 / 桑梓 多人剧',
    artwork:
      'https://imagev2.xmcdn.com/group48/M09/32/17/wKgKlVvI1z_T1785AAHM-J744wU991.jpg!op_type=3&columns=640&rows=640',
    description: '警校毕业生许七安穿越大奉王朝，勾栏听曲、破案断狱、护佑人间！2024年度现象级多人有声剧。',
    episodeCount: 380,
    playCount: '22.4亿',
    tag: '年度爆款',
    category: '高武探案',
    completed: true,
  },
  {
    id: 'xm-st-5',
    title: '《诡秘之主》蒸汽朋克克苏鲁史诗',
    artist: '爱潜水的乌贼 原著 / 广播剧团队',
    artwork:
      'https://imagev2.xmcdn.com/group45/M08/78/41/wKgKlFs5nZ-iF44RAAFY1g_L-kQ112.jpg!op_type=3&columns=640&rows=640',
    description: '愚者降临，灰雾之上的神秘存在！维多利亚时代蒸汽风暴与神秘塔罗会的宏大冒险。',
    episodeCount: 300,
    playCount: '14.2亿',
    tag: '克苏鲁神作',
    category: '奇幻魔法',
    completed: true,
  },
]

export const MOCK_RADIO_ALBUMS: ExtendedXimalayaAlbum[] = [
  {
    id: 'xm-rd-1',
    title: '晚安卡车人：长途驾驶温情陪伴专线',
    artist: '老陈深夜电台 / 喜马车联',
    artwork:
      'https://imagev2.xmcdn.com/group45/M07/58/B6/wKgKlFs5nZCSyU7yAAEv_J32Z-Q438.jpg!op_type=3&columns=640&rows=640',
    description: '专为千万长途司机打造的夜间广播。路况闲聊、平安故事、动人老歌，让漫长国道高速不再孤单。',
    episodeCount: 50,
    playCount: '3.9亿',
    tag: '货运专享',
    category: '车载电台',
    completed: false,
  },
  {
    id: 'xm-rd-2',
    title: '易中天品三国（央视百家讲坛高清原声）',
    artist: '易中天 教授',
    artwork:
      'https://imagev2.xmcdn.com/group44/M09/4C/6A/wKgKkVs1dcewU9VbAAFr_Kj012U445.jpg!op_type=3&columns=640&rows=640',
    description: '以人带事，以事说理，生动还原曹操、刘备、诸葛亮的真实历史面貌。',
    episodeCount: 52,
    playCount: '6.7亿',
    tag: '百家讲坛',
    category: '人文历史',
    completed: true,
  },
  {
    id: 'xm-rd-3',
    title: '长途防困·公路重低音慢摇动感电台',
    artist: '极速车音 / DJ阿哲',
    artwork:
      'https://imagev2.xmcdn.com/group46/M0A/A1/B8/wKgKj1trjKjSQq9zAAFe3uR0iHQ573.jpg!op_type=3&columns=640&rows=640',
    description: '极具驾驶律动的重低音车载电音串烧，有效驱散长途驾驶困倦，律动与激情齐飞。',
    episodeCount: 40,
    playCount: '5.1亿',
    tag: '防困提神',
    category: '车载DJ',
    completed: false,
  },
  {
    id: 'xm-rd-4',
    title: '雨夜驾驶：轻音民谣与治愈白噪音',
    artist: '静心森林 / 声音旅行家',
    artwork:
      'https://imagev2.xmcdn.com/group48/M03/89/3C/wKgKlVv1w1_hYQoAAAH8x-P1XnI647.jpg!op_type=3&columns=640&rows=640',
    description: '舒缓的木吉他与车窗雨滴声交织，缓解驾驶疲劳，带来内心的安宁。',
    episodeCount: 35,
    playCount: '2.8亿',
    tag: '解压白噪',
    category: '治愈音乐',
    completed: false,
  },
]

export const GENRE_AUDIO_STREAMS = {
  // 1. 科幻有声剧 / 史诗小说 (《三体》全集、鬼吹灯、凡人修仙传等)
  scifi: [
    'https://aod.cos.tx.xmcdn.com/storages/ceef-audiofreehighqps/F2/8F/GKwRIUEH8NbRAZlykgIFt-eo-aacv2-48K.m4a',
    'https://aod.cos.tx.xmcdn.com/storages/b02a-audiofreehighqps/D3/25/GKwRIasJ-OV7ABSoEQLIhivh.m4a',
  ],

  // 2. 爆笑相声与脱口秀 (郭德纲于谦、岳云鹏、爆笑段子)
  xiangsheng: [
    'https://aod.cos.tx.xmcdn.com/storages/1825-audiofreehighqps/F1/1F/GKwRIDoOW5CKAREisgTJPcGU.m4a',
    'https://aod.cos.tx.xmcdn.com/storages/68d4-audiofreehighqps/6E/6E/GKwRIW4OgmgeAHBe4ATZKeTF.m4a',
    'https://aod.cos.tx.xmcdn.com/storages/2097-audiofreehighqps/A8/E6/GKwRIDoOgmfjAGu_UwTZKc2g.m4a',
    'https://aod.cos.tx.xmcdn.com/storages/3c7a-audiofreehighqps/25/BE/GKwRIRwOz4UTAdv-xgT71sIL.m4a',
    'https://aod.cos.tx.xmcdn.com/group15/M06/45/95/wKgDaFWmh6jD4k4jALKVF3LRe-A832.m4a',
    'https://aod.cos.tx.xmcdn.com/group11/M02/29/09/wKgDa1WFKNvh9UFdAL7CPsFHKCY910.m4a',
    'https://aod.cos.tx.xmcdn.com/group14/M02/2C/E0/wKgDZFWJytSj62_dAK1l_BdHr4g020.m4a',
    'https://aod.cos.tx.xmcdn.com/group8/M0B/2C/88/wKgDYFWJwvGTjdnkAHk-Cikzj8I036.m4a',
  ],

  // 3. 评书大师与历史大剧 (单田芳白眉大侠、袁阔成三国演义、刘兰芳岳飞传、明朝那些事儿)
  pingshu: [
    'https://aod.cos.tx.xmcdn.com/storages/a152-audiofreehighqps/D5/4C/GMCoOR4I0hiHACAAAAJYCShV.mp3',
    'https://aod.cos.tx.xmcdn.com/storages/9369-audiofreehighqps/9F/0A/GKwRIaIOzj9hAMSwvAT7XSAZ.m4a',
    'https://aod.cos.tx.xmcdn.com/group39/M07/34/82/wKgJnlqChT2jRXU8AEn2S2TpSzo586.m4a',
  ],

  // 4. 深夜车载电台与温情夜话 (晚安卡车人、深夜车载电台、平安故事)
  radio: [
    'https://aod.cos.tx.xmcdn.com/storages/a71e-audiofreehighqps/12/7A/GKwRIJIOu5J4AD4AjATy-pqV.m4a',
    'https://aod.cos.tx.xmcdn.com/storages/7c6b-audiofreehighqps/8C/4A/GKwRIDoJRDwVACAAAAKG1VcM.m4a',
    'https://aod.cos.tx.xmcdn.com/storages/b02a-audiofreehighqps/D3/25/GKwRIasJ-OV7ABSoEQLIhivh.m4a',
  ],

  // 5. 防困提神·公路重低音慢摇 DJ (极速车音、慢摇动感电台、打碟电音)
  dj: [
    'https://aod.cos.tx.xmcdn.com/storages/8551-audiofreehighqps/97/E4/GKwRIRwOjplnBPxIiwTeclL2.m4a',
    'https://aod.cos.tx.xmcdn.com/storages/96ff-audiofreehighqps/38/66/GKwRIaIOfuvzBfaqKgTX30Db.m4a',
  ],

  // 6. 舒缓白噪音与轻音古典 (雨夜驾驶、古典音乐、静心木吉他)
  relax: [
    'https://aod.cos.tx.xmcdn.com/storages/aea8-audiofreehighqps/A4/17/GKwRIRwOx0GdAFzXCgT4dSWb.m4a',
    'https://aod.cos.tx.xmcdn.com/storages/731b-audiofreehighqps/DB/12/GKwRIasKWu1OAUGvEwLrO8TW.m4a',
  ],
}

export function sampleAudioUrl(idx = 0): string {
  const all = [
    ...GENRE_AUDIO_STREAMS.scifi,
    ...GENRE_AUDIO_STREAMS.xiangsheng,
    ...GENRE_AUDIO_STREAMS.pingshu,
    ...GENRE_AUDIO_STREAMS.radio,
    ...GENRE_AUDIO_STREAMS.dj,
    ...GENRE_AUDIO_STREAMS.relax,
  ]
  const i = Math.abs(idx) % all.length
  return all[i]
}

export function getAudioUrlForCategory(category: string | undefined, index = 0): string {
  const cat = (category || '').toLowerCase()
  let pool = GENRE_AUDIO_STREAMS.radio

  if (
    cat.includes('相声') ||
    cat.includes('段子') ||
    cat.includes('德云') ||
    cat.includes('于谦') ||
    cat.includes('郭德纲') ||
    cat.includes('岳云鹏') ||
    cat.includes('爆笑')
  ) {
    pool = GENRE_AUDIO_STREAMS.xiangsheng
  } else if (
    cat.includes('评书') ||
    cat.includes('历史') ||
    cat.includes('明朝') ||
    cat.includes('三国') ||
    cat.includes('单田芳') ||
    cat.includes('岳飞') ||
    cat.includes('袁阔成') ||
    cat.includes('刘兰芳')
  ) {
    pool = GENRE_AUDIO_STREAMS.pingshu
  } else if (
    cat.includes('科幻') ||
    cat.includes('三体') ||
    cat.includes('广播剧') ||
    cat.includes('修仙') ||
    cat.includes('小说') ||
    cat.includes('鬼吹灯') ||
    cat.includes('盗墓') ||
    cat.includes('凡人') ||
    cat.includes('诡秘')
  ) {
    pool = GENRE_AUDIO_STREAMS.scifi
  } else if (
    cat.includes('dj') ||
    cat.includes('慢摇') ||
    cat.includes('重低音') ||
    cat.includes('防困') ||
    cat.includes('电音')
  ) {
    pool = GENRE_AUDIO_STREAMS.dj
  } else if (
    cat.includes('白噪') ||
    cat.includes('雨夜') ||
    cat.includes('轻音') ||
    cat.includes('治愈') ||
    cat.includes('古典') ||
    cat.includes('静心') ||
    cat.includes('民谣')
  ) {
    pool = GENRE_AUDIO_STREAMS.relax
  }

  const i = Math.abs(index) % pool.length
  return pool[i]
}

export function getAudioUrlForTrack(track: ExtendedXimalayaTrack, fallbackIndex = 0): string {
  if (track.url) return track.url
  const title = (track.title || '') + ' ' + (track.album || '') + ' ' + (track.artist || '')
  return getAudioUrlForCategory(title, fallbackIndex || (typeof track.id === 'string' ? track.id.charCodeAt(0) : 0))
}

export const MOCK_ALBUM_TRACKS_MAP: Record<string, ExtendedXimalayaTrack[]> = {
  'xm-feat-1': [
    {
      id: '301',
      title: '第01集：红岸基地与宇宙的啼鸣',
      artist: '729声工场 / 王明军',
      album: '《三体》全集广播剧',
      duration: 1820,
      episodeNumber: 1,
      artwork: MOCK_FEATURED_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.scifi[0],
    },
    {
      id: '302',
      title: '第02集：倒计时与幽灵射手假说',
      artist: '729声工场 / 阿杰',
      album: '《三体》全集广播剧',
      duration: 1940,
      episodeNumber: 2,
      artwork: MOCK_FEATURED_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.scifi[1],
    },
    {
      id: '303',
      title: '第03集：三体游戏中的脱水与浸泡',
      artist: '729声工场 / 季冠霖',
      album: '《三体》全集广播剧',
      duration: 2110,
      episodeNumber: 3,
      artwork: MOCK_FEATURED_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.scifi[0],
    },
    {
      id: '304',
      title: '第04集：古筝行动与审判日号截击',
      artist: '729声工场 / 乔诗语',
      album: '《三体》全集广播剧',
      duration: 2450,
      episodeNumber: 4,
      artwork: MOCK_FEATURED_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.scifi[1],
    },
    {
      id: '305',
      title: '第05集：黑暗森林法则的冰冷真相',
      artist: '729声工场 / 王明军',
      album: '《三体》全集广播剧',
      duration: 2280,
      episodeNumber: 5,
      artwork: MOCK_FEATURED_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.scifi[0],
    },
    {
      id: '306',
      title: '第06集：面壁者罗辑与最后的执剑人',
      artist: '729声工场 / 阿杰',
      album: '《三体》全集广播剧',
      duration: 2560,
      episodeNumber: 6,
      artwork: MOCK_FEATURED_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.scifi[1],
    },
  ],
  'xm-feat-2': [
    {
      id: '311',
      title: '【爆笑相声】大福寿全（百场精选版）',
      artist: '郭德纲 / 于谦',
      album: '郭德纲于谦 相声十年经典',
      duration: 2150,
      episodeNumber: 1,
      artwork: MOCK_FEATURED_ALBUMS[1].artwork,
      url: GENRE_AUDIO_STREAMS.xiangsheng[0],
    },
    {
      id: '312',
      title: '【经典对口】论相声五十年之现状',
      artist: '郭德纲 / 于谦',
      album: '郭德纲于谦 相声十年经典',
      duration: 2780,
      episodeNumber: 2,
      artwork: MOCK_FEATURED_ALBUMS[1].artwork,
      url: GENRE_AUDIO_STREAMS.xiangsheng[1],
    },
    {
      id: '313',
      title: '【返场小段】托妻献子与于老爷子名场面',
      artist: '郭德纲 / 于谦',
      album: '郭德纲于谦 相声十年经典',
      duration: 1980,
      episodeNumber: 3,
      artwork: MOCK_FEATURED_ALBUMS[1].artwork,
      url: GENRE_AUDIO_STREAMS.xiangsheng[2],
    },
    {
      id: '314',
      title: '【经典重温】西征梦·大帅府之夜',
      artist: '郭德纲 / 于谦',
      album: '郭德纲于谦 相声十年经典',
      duration: 2420,
      episodeNumber: 4,
      artwork: MOCK_FEATURED_ALBUMS[1].artwork,
      url: GENRE_AUDIO_STREAMS.xiangsheng[3],
    },
    {
      id: '315',
      title: '【压轴名段】黄鹤楼与京剧学唱',
      artist: '郭德纲 / 于谦',
      album: '郭德纲于谦 相声十年经典',
      duration: 2260,
      episodeNumber: 5,
      artwork: MOCK_FEATURED_ALBUMS[1].artwork,
      url: GENRE_AUDIO_STREAMS.xiangsheng[4],
    },
  ],
  'xm-feat-3': [
    {
      id: '321',
      title: '第01回：大明开国，朱元璋破局从乞丐到帝王',
      artist: '当年明月 原著',
      album: '《明朝那些事儿》典藏版',
      duration: 2100,
      episodeNumber: 1,
      artwork: MOCK_FEATURED_ALBUMS[2].artwork,
      url: GENRE_AUDIO_STREAMS.pingshu[0],
    },
    {
      id: '322',
      title: '第02回：鄱阳湖大战，陈友谅最后的宿命',
      artist: '当年明月 原著',
      album: '《明朝那些事儿》典藏版',
      duration: 2250,
      episodeNumber: 2,
      artwork: MOCK_FEATURED_ALBUMS[2].artwork,
      url: GENRE_AUDIO_STREAMS.pingshu[1],
    },
    {
      id: '323',
      title: '第03回：靖难之役，燕王朱棣的风雪南征',
      artist: '当年明月 原著',
      album: '《明朝那些事儿》典藏版',
      duration: 2340,
      episodeNumber: 3,
      artwork: MOCK_FEATURED_ALBUMS[2].artwork,
      url: GENRE_AUDIO_STREAMS.pingshu[2],
    },
    {
      id: '324',
      title: '第04回：于谦力挽狂澜，北京保卫战千古忠魂',
      artist: '当年明月 原著',
      album: '《明朝那些事儿》典藏版',
      duration: 2480,
      episodeNumber: 4,
      artwork: MOCK_FEATURED_ALBUMS[2].artwork,
      url: GENRE_AUDIO_STREAMS.pingshu[0],
    },
  ],
  'xm-feat-4': [
    {
      id: '331',
      title: '第01期：夜行国道·点一首老歌给回家的你',
      artist: '晚安公路',
      album: '深夜车载电台',
      duration: 2400,
      episodeNumber: 1,
      artwork: MOCK_FEATURED_ALBUMS[3].artwork,
      url: GENRE_AUDIO_STREAMS.radio[0],
    },
    {
      id: '332',
      title: '第02期：雨夜连绵，货车司机的专属热茶与故事',
      artist: '晚安公路',
      album: '深夜车载电台',
      duration: 2520,
      episodeNumber: 2,
      artwork: MOCK_FEATURED_ALBUMS[3].artwork,
      url: GENRE_AUDIO_STREAMS.radio[1],
    },
    {
      id: '333',
      title: '第03期：行车平安，千里长途终有归期',
      artist: '晚安公路',
      album: '深夜车载电台',
      duration: 2280,
      episodeNumber: 3,
      artwork: MOCK_FEATURED_ALBUMS[3].artwork,
      url: GENRE_AUDIO_STREAMS.radio[2],
    },
  ],
  'xm-xs-1': [
    {
      id: 'xs101',
      title: '【相声名段】论相声五十年之现状（珍藏版）',
      artist: '德云社 郭德纲 / 于谦',
      album: '郭德纲于谦 爆笑相声精选百场',
      duration: 2400,
      episodeNumber: 1,
      artwork: MOCK_XIANGSHENG_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.xiangsheng[1],
    },
    {
      id: 'xs102',
      title: '【爆笑返场】西征梦·大帅府之夜',
      artist: '德云社 郭德纲 / 于谦',
      album: '郭德纲于谦 爆笑相声精选百场',
      duration: 2520,
      episodeNumber: 2,
      artwork: MOCK_XIANGSHENG_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.xiangsheng[3],
    },
    {
      id: 'xs103',
      title: '【对口名场面】托妻献子与于老爷子名场面',
      artist: '德云社 郭德纲 / 于谦',
      album: '郭德纲于谦 爆笑相声精选百场',
      duration: 2280,
      episodeNumber: 3,
      artwork: MOCK_XIANGSHENG_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.xiangsheng[6],
    },
  ],
  'xm-xs-2': [
    {
      id: 'xs201',
      title: '【爆笑解乏】五环之歌专场版与我要幸福',
      artist: '岳云鹏 / 孙越',
      album: '岳云鹏孙越 相声名场面全集',
      duration: 2100,
      episodeNumber: 1,
      artwork: MOCK_XIANGSHENG_ALBUMS[1].artwork,
      url: GENRE_AUDIO_STREAMS.xiangsheng[7],
    },
    {
      id: 'xs202',
      title: '【返场对口】学歌曲与造厨名场面',
      artist: '岳云鹏 / 孙越',
      album: '岳云鹏孙越 相声名场面全集',
      duration: 2340,
      episodeNumber: 2,
      artwork: MOCK_XIANGSHENG_ALBUMS[1].artwork,
      url: GENRE_AUDIO_STREAMS.xiangsheng[2],
    },
  ],
  'xm-xs-3': [
    {
      id: 'xs301',
      title: '第01回：白眉大侠徐良出世闹开封',
      artist: '单田芳 评书大师',
      album: '单田芳经典评书《白眉大侠》全本',
      duration: 2160,
      episodeNumber: 1,
      artwork: MOCK_XIANGSHENG_ALBUMS[2].artwork,
      url: GENRE_AUDIO_STREAMS.pingshu[0],
    },
    {
      id: 'xs302',
      title: '第02回：三探阎王寨，房书安舍命助徐良',
      artist: '单田芳 评书大师',
      album: '单田芳经典评书《白眉大侠》全本',
      duration: 2240,
      episodeNumber: 2,
      artwork: MOCK_XIANGSHENG_ALBUMS[2].artwork,
      url: GENRE_AUDIO_STREAMS.pingshu[1],
    },
  ],
  'xm-xs-4': [
    {
      id: 'xs401',
      title: '第01回：桃园结义英雄起，天下大乱曹操刺董',
      artist: '袁阔成 先生',
      album: '袁阔成评书《三国演义》纯音频版',
      duration: 2400,
      episodeNumber: 1,
      artwork: MOCK_XIANGSHENG_ALBUMS[3].artwork,
      url: GENRE_AUDIO_STREAMS.pingshu[0],
    },
    {
      id: 'xs402',
      title: '第02回：舌战群儒火烧赤壁，谈笑风生借东风',
      artist: '袁阔成 先生',
      album: '袁阔成评书《三国演义》纯音频版',
      duration: 2580,
      episodeNumber: 2,
      artwork: MOCK_XIANGSHENG_ALBUMS[3].artwork,
      url: GENRE_AUDIO_STREAMS.pingshu[1],
    },
  ],
  'xm-st-1': [
    {
      id: 'st101',
      title: '第01回：精绝古城·十六字阴阳风水秘术',
      artist: '天下霸唱 原著 / 周建龙 播讲',
      album: '《鬼吹灯全八部》周建龙原声大碟',
      duration: 2340,
      episodeNumber: 1,
      artwork: MOCK_STORY_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.scifi[0],
    },
    {
      id: 'st102',
      title: '第02回：龙岭迷窟·幽灵悬魂梯之谜',
      artist: '天下霸唱 原著 / 周建龙 播讲',
      album: '《鬼吹灯全八部》周建龙原声大碟',
      duration: 2480,
      episodeNumber: 2,
      artwork: MOCK_STORY_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.scifi[1],
    },
  ],
  'xm-rd-1': [
    {
      id: 'rd101',
      title: '第01期：国道夜行·平安故事与暖心老歌',
      artist: '老陈深夜电台 / 喜马车联',
      album: '晚安卡车人：长途驾驶温情陪伴专线',
      duration: 2400,
      episodeNumber: 1,
      artwork: MOCK_RADIO_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.radio[0],
    },
    {
      id: 'rd102',
      title: '第02期：雨夜服务区的一碗热面与远方牵挂',
      artist: '老陈深夜电台 / 喜马车联',
      album: '晚安卡车人：长途驾驶温情陪伴专线',
      duration: 2520,
      episodeNumber: 2,
      artwork: MOCK_RADIO_ALBUMS[0].artwork,
      url: GENRE_AUDIO_STREAMS.radio[1],
    },
  ],
  'xm-rd-3': [
    {
      id: 'rd301',
      title: '【超嗨慢摇】夜行公路极致慢摇重低音串烧（上）',
      artist: '极速车音 / DJ阿哲',
      album: '长途防困·公路重低音慢摇动感电台',
      duration: 2700,
      episodeNumber: 1,
      artwork: MOCK_RADIO_ALBUMS[2].artwork,
      url: GENRE_AUDIO_STREAMS.dj[0],
    },
    {
      id: 'rd302',
      title: '【提神电音】柏林之声自驾狂飙80公里包房慢摇（下）',
      artist: '极速车音 / DJ阿哲',
      album: '长途防困·公路重低音慢摇动感电台',
      duration: 2850,
      episodeNumber: 2,
      artwork: MOCK_RADIO_ALBUMS[2].artwork,
      url: GENRE_AUDIO_STREAMS.dj[1],
    },
  ],
  'xm-rd-4': [
    {
      id: 'rd401',
      title: '第01期：雨滴敲窗·木吉他伴你入夜行驶',
      artist: '静心森林 / 声音旅行家',
      album: '雨夜驾驶：轻音民谣与治愈白噪音',
      duration: 2400,
      episodeNumber: 1,
      artwork: MOCK_RADIO_ALBUMS[3].artwork,
      url: GENRE_AUDIO_STREAMS.relax[0],
    },
    {
      id: 'rd402',
      title: '第02期：静心森林与车窗外的晚风安眠曲',
      artist: '静心森林 / 声音旅行家',
      album: '雨夜驾驶：轻音民谣与治愈白噪音',
      duration: 2520,
      episodeNumber: 2,
      artwork: MOCK_RADIO_ALBUMS[3].artwork,
      url: GENRE_AUDIO_STREAMS.relax[1],
    },
  ],
}

/** Fallback tracks for direct recommendation list */
export const MOCK_RECOMMENDED_TRACKS: ExtendedXimalayaTrack[] = [
  MOCK_ALBUM_TRACKS_MAP['xm-feat-1'][0],
  MOCK_ALBUM_TRACKS_MAP['xm-feat-2'][0],
  MOCK_ALBUM_TRACKS_MAP['xm-feat-3'][0],
  MOCK_ALBUM_TRACKS_MAP['xm-feat-4'][0],
]

function loadFavoritesFromStorage(): ExtendedXimalayaAlbum[] {
  try {
    const raw = localStorage.getItem('westplay.ximalaya.favorites')
    return raw ? JSON.parse(raw) : [MOCK_FEATURED_ALBUMS[0], MOCK_FEATURED_ALBUMS[1]]
  } catch {
    return [MOCK_FEATURED_ALBUMS[0], MOCK_FEATURED_ALBUMS[1]]
  }
}

function loadHistoryFromStorage(): ExtendedXimalayaTrack[] {
  try {
    const raw = localStorage.getItem('westplay.ximalaya.history')
    return raw ? JSON.parse(raw) : [MOCK_ALBUM_TRACKS_MAP['xm-feat-1'][0], MOCK_ALBUM_TRACKS_MAP['xm-feat-2'][0]]
  } catch {
    return [MOCK_ALBUM_TRACKS_MAP['xm-feat-1'][0], MOCK_ALBUM_TRACKS_MAP['xm-feat-2'][0]]
  }
}

export const useXimalaya = create<XimalayaState>(() => ({
  liveQueue: [],
  sessionRequestId: null,
  pendingPlaybackTrack: null,
  signedIn: IN_HOST ? null : false,
  signingIn: false,
  playing: false,
  tab: 'featured',
  loading: false,
  tracks: MOCK_RECOMMENDED_TRACKS,
  albums: MOCK_FEATURED_ALBUMS,
  selectedAlbum: null,
  albumTracks: [],
  playback: null,
  nowPlaying: false,
  volume: 1,
  playbackSpeed: 1.0,
  sleepTimerMinutes: null,
  sleepTimerEndsAt: null,
  queue: MOCK_RECOMMENDED_TRACKS,
  queueIndex: 0,
  queueOpen: false,
  searchQuery: '',
  searchResults: [],
  searching: false,
  favorites: loadFavoritesFromStorage(),
  history: loadHistoryFromStorage(),
  pendingPlayAlbumId: null,
  pendingPlayStartIndex: null,
}))

let playbackSequence = 0
let browserAudio: HTMLAudioElement | null = null

function getBrowserAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined' || isInHost()) return null
  if (!browserAudio) {
    try {
      browserAudio = new Audio()
      browserAudio.preload = 'auto'
      browserAudio.addEventListener?.('ended', () => {
        skip(1)
      })
      browserAudio.addEventListener?.('error', (e) => {
        console.warn('[ximalaya-browser] Audio error:', e)
      })
    } catch {
      browserAudio = null
    }
  }
  return browserAudio
}

function send(command: XimalayaCommand): void {
  if (isInHost()) postToHost({ type: 'ximalaya', command })
}

export function sendStart(): void {
  send({ action: 'start' })
  send({ action: 'ask', id: 1, question: { ask: 'recommend' } })
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  send({ action: 'signOut' })
}

export function receiveState(signedIn: boolean | null, playing: boolean | null, signingIn: boolean): void {
  useXimalaya.setState({
    signedIn,
    playing: useXimalaya.getState().playback ? useXimalaya.getState().playing : playing,
    signingIn,
  })
}

export function receiveAnswer(
  _id: number,
  failed?: boolean,
  _error?: string,
  tracks?: XimalayaTrack[],
  albums?: XimalayaAlbum[],
  radio?: { kind: string; data: unknown },
): void {
  if (receiveRadioAnswer(_id, radio, failed, _error)) return
  useXimalaya.setState({ loading: false, searching: false })
  if (!failed) {
    if (tracks && tracks.length > 0) {
      const { selectedAlbum, tab, pendingPlayAlbumId, pendingPlayStartIndex } = useXimalaya.getState()
      if (selectedAlbum) {
        useXimalaya.setState({ albumTracks: tracks })
        if (pendingPlayAlbumId === selectedAlbum.id && typeof pendingPlayStartIndex === 'number') {
          useXimalaya.setState({ pendingPlayAlbumId: null, pendingPlayStartIndex: null })
          const target = tracks[pendingPlayStartIndex] || tracks[0]
          if (target) {
            play(target, tracks)
          }
        }
      } else if (tab === 'search') {
        useXimalaya.setState({ searchResults: tracks })
      } else {
        useXimalaya.setState({ tracks })
      }
    }
    if (albums && albums.length > 0) {
      useXimalaya.setState({ albums })
    }
  }
}

export function receivePlayback(playback: XimalayaPlayback | null): void {
  const state = useXimalaya.getState()
  if (playback?.requestId != null && state.sessionRequestId != null && playback.requestId !== state.sessionRequestId)
    return
  if (playback && playback.owner !== 'radio' && playback.status === 'ended') {
    if (state.playback?.status !== 'ended') {
      useXimalaya.setState({ playback: { ...playback, at: performance.now() }, playing: false })
      skip(1)
    }
    return
  }
  useXimalaya.setState({
    playback: playback ? { ...playback, at: performance.now() } : null,
    playing: playback ? playback.status === 'playing' : false,
    ...(playback ? {} : { nowPlaying: false }),
  })
}

export function positionOf(playback: XimalayaState['playback'], now: number): number {
  if (!playback || playback.isLive) return 0
  const speed = playback.speed || 1.0
  const run = playback.status === 'playing' ? ((now - playback.at) / 1000) * speed : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, playback.position + run)
}

function show(change: Partial<XimalayaPlayback & { speed?: number }>): void {
  const { playback, playbackSpeed } = useXimalaya.getState()
  if (!playback) return
  const now = performance.now()
  useXimalaya.setState({
    playback: {
      ...playback,
      position: positionOf(playback, now),
      at: now,
      speed: playbackSpeed,
      ...change,
    },
    ...(change.status ? { playing: change.status === 'playing' } : {}),
  })
}

export function selectTab(tab: XimalayaTab): void {
  useXimalaya.setState({ tab, selectedAlbum: null, loading: false })
  if (tab === 'featured') {
    if (IN_HOST) {
      send({ action: 'ask', id: Date.now(), question: { ask: 'recommend' } })
    } else {
      useXimalaya.setState({ albums: MOCK_FEATURED_ALBUMS, tracks: MOCK_RECOMMENDED_TRACKS })
    }
  } else if (tab === 'xiangsheng') {
    if (IN_HOST) {
      send({ action: 'ask', id: Date.now(), question: { ask: 'category', category: 'xiangsheng' } })
    } else {
      useXimalaya.setState({ albums: MOCK_XIANGSHENG_ALBUMS })
    }
  } else if (tab === 'story') {
    if (IN_HOST) {
      send({ action: 'ask', id: Date.now(), question: { ask: 'category', category: 'youshengshu' } })
    } else {
      useXimalaya.setState({ albums: MOCK_STORY_ALBUMS })
    }
  } else if (tab === 'radio') {
    if (IN_HOST) {
      send({ action: 'ask', id: Date.now(), question: { ask: 'category', category: 'diantai' } })
    } else {
      useXimalaya.setState({ albums: MOCK_RADIO_ALBUMS })
    }
  }
}

export function selectAlbum(album: ExtendedXimalayaAlbum): void {
  useXimalaya.setState({ selectedAlbum: album, loading: true })
  const isNumericAlbum = /^\d+$/.test(String(album.id))
  if (IN_HOST && isNumericAlbum) {
    send({ action: 'ask', id: Date.now(), question: { ask: 'albumTracks', albumId: album.id } })
  } else {
    const list = MOCK_ALBUM_TRACKS_MAP[album.id] || [
      {
        id: `${album.id}-t1`,
        title: `${album.title} - 第01集`,
        artist: album.artist,
        album: album.title,
        artwork: album.artwork,
        duration: 2100,
        episodeNumber: 1,
        url: getAudioUrlForCategory(album.category || album.tag || album.title, 0),
      },
      {
        id: `${album.id}-t2`,
        title: `${album.title} - 第02集`,
        artist: album.artist,
        album: album.title,
        artwork: album.artwork,
        duration: 2280,
        episodeNumber: 2,
        url: getAudioUrlForCategory(album.category || album.tag || album.title, 1),
      },
      {
        id: `${album.id}-t3`,
        title: `${album.title} - 第03集`,
        artist: album.artist,
        album: album.title,
        artwork: album.artwork,
        duration: 1950,
        episodeNumber: 3,
        url: getAudioUrlForCategory(album.category || album.tag || album.title, 2),
      },
    ]
    useXimalaya.setState({ albumTracks: list, loading: false })
  }
}

export function backToBrowse(): void {
  useXimalaya.setState({ selectedAlbum: null, albumTracks: [] })
}

/** Shared playback session. Radio never mutates the on-demand queue or preferences. */
export function play(track?: ExtendedXimalayaTrack, queue?: ExtendedXimalayaTrack[]): void {
  const state = useXimalaya.getState()
  if (!track && state.pendingPlaybackTrack) {
    play(state.pendingPlaybackTrack, state.playback?.isLive ? state.liveQueue : state.queue)
    return
  }
  const requestId = ++playbackSequence
  if (!track) {
    useXimalaya.setState({ sessionRequestId: requestId })
    if (state.playback?.isLive) show({ status: 'loading', error: null })
    if (useXimalaya.getState().sessionRequestId !== requestId) return
    send({ action: 'play', requestId })
    if (state.playback?.isLive) return
    getBrowserAudio()
      ?.play?.()
      .catch(() => {})
    if (!isInHost()) show({ status: 'playing' })
    return
  }
  const targetTrack = {
    ...track,
    url: track.radio ? undefined : track.url || (IN_HOST ? undefined : getAudioUrlForTrack(track)),
  }
  const newQueue = queue?.length ? queue.slice() : state.queue.length ? state.queue : [targetTrack]
  const history = targetTrack.radio
    ? state.history
    : [targetTrack, ...state.history.filter((h) => h.id !== targetTrack.id)].slice(0, 50)
  if (!targetTrack.radio) {
    try {
      localStorage.setItem('westplay.ximalaya.history', JSON.stringify(history))
    } catch {
      /* Storage is optional for playback. */
    }
  }
  useXimalaya.setState({
    sessionRequestId: requestId,
    pendingPlaybackTrack: targetTrack,
    playback: {
      title: targetTrack.title,
      artist: targetTrack.artist,
      artwork: targetTrack.artwork,
      duration: targetTrack.radio ? 0 : targetTrack.duration || 1800,
      position: 0,
      status: isInHost() ? 'loading' : 'playing',
      at: performance.now(),
      speed: targetTrack.radio ? 1 : state.playbackSpeed,
      owner: targetTrack.radio ? 'radio' : 'ximalaya',
      radioId: targetTrack.radioId,
      isLive: Boolean(targetTrack.radio),
      requestId,
    },
    playing: !isInHost(),
    nowPlaying: !targetTrack.radio,
    history,
    pendingPlayAlbumId: null,
    pendingPlayStartIndex: null,
    ...(targetTrack.radio
      ? { liveQueue: newQueue, sleepTimerMinutes: null, sleepTimerEndsAt: null }
      : {
          queue: newQueue,
          queueIndex: Math.max(
            0,
            newQueue.findIndex((t) => t.id === track.id),
          ),
        }),
  })
  if (useXimalaya.getState().sessionRequestId !== requestId) return
  send({ action: 'speed', rate: targetTrack.radio ? 1 : state.playbackSpeed })
  send({ action: 'volume', percent: Math.round(state.volume * 100) })
  send({ action: 'play', track: targetTrack, requestId })
  if (useXimalaya.getState().sessionRequestId === requestId) useXimalaya.setState({ pendingPlaybackTrack: null })
  const audio = getBrowserAudio()
  if (audio && !targetTrack.radio && targetTrack.url) {
    audio.pause?.()
    audio.src = targetTrack.url
    audio.playbackRate = state.playbackSpeed
    audio.volume = state.volume
    audio.play?.().catch(() => {})
  }
}

export function playAlbum(album: ExtendedXimalayaAlbum, startIndex = 0): void {
  const state = useXimalaya.getState()
  if (state.selectedAlbum?.id === album.id && state.albumTracks.length > 0) {
    const target = state.albumTracks[startIndex] || state.albumTracks[0]
    play(target, state.albumTracks)
    return
  }

  const isNumericAlbum = /^\d+$/.test(String(album.id))
  if (IN_HOST && isNumericAlbum) {
    useXimalaya.setState({ pendingPlayAlbumId: album.id, pendingPlayStartIndex: startIndex })
    selectAlbum(album)
    return
  }

  selectAlbum(album)
  const tracks = MOCK_ALBUM_TRACKS_MAP[album.id] || [
    {
      id: `${album.id}-ep1`,
      title: `${album.title} - 第01集`,
      artist: album.artist,
      album: album.title,
      artwork: album.artwork,
      duration: 1800,
      episodeNumber: 1,
      url: getAudioUrlForCategory(album.category || album.tag || album.title, 0),
    },
  ]
  const target = tracks[startIndex] || tracks[0]
  play(target, tracks)
}

export function pausePlayback(): void {
  const { playback } = useXimalaya.getState()
  const requestId = ++playbackSequence
  const now = performance.now()
  // Subscribers run synchronously: invalidate the request and stop loading in one update.
  useXimalaya.setState({
    sessionRequestId: requestId,
    playing: false,
    playback: playback
      ? { ...playback, requestId, position: positionOf(playback, now), at: now, status: 'paused' }
      : null,
  })
  send(playback ? { action: 'pause', requestId } : { action: 'pause' })
  getBrowserAudio()?.pause?.()
}
export function playOrPause(): void {
  const { playing, playback } = useXimalaya.getState()
  if (playing || playback?.status === 'loading') pausePlayback()
  else play()
}
export function skip(direction: 1 | -1): void {
  const state = useXimalaya.getState()
  const live = state.playback?.owner === 'radio'
  const queue = live ? state.liveQueue : state.queue
  const index = live ? queue.findIndex((t) => t.radioId === state.playback?.radioId) : state.queueIndex
  if (queue.length) play(queue[(index + direction + queue.length) % queue.length], queue)
  else send({ action: direction === 1 ? 'next' : 'previous' })
}

export function seek(seconds: number): void {
  if (useXimalaya.getState().playback?.isLive) return
  send({ action: 'seek', seconds })
  const audio = getBrowserAudio()
  if (audio) {
    try {
      audio.currentTime = seconds
    } catch {
      // ignore
    }
  }
  show({ position: Math.max(0, seconds) })
}

/** In-cabin skip: jumps relative seconds (e.g. -15s rewind or +30s fast-forward) */
export function skipSeconds(delta: number): void {
  const { playback } = useXimalaya.getState()
  if (!playback) return
  const current = positionOf(playback, performance.now())
  const target = Math.max(0, Math.min(playback.duration || 3600, current + delta))
  seek(target)
}

export function setPlaybackSpeed(speed: PlaybackSpeed): void {
  if (useXimalaya.getState().playback?.isLive) return
  send({ action: 'speed', rate: speed })
  useXimalaya.setState({ playbackSpeed: speed })
  const audio = getBrowserAudio()
  if (audio) {
    try {
      audio.playbackRate = speed
    } catch {
      // ignore
    }
  }
  show({ speed })
}

export function cyclePlaybackSpeed(): void {
  const speeds: PlaybackSpeed[] = [1.0, 1.25, 1.5, 1.75, 2.0]
  const current = useXimalaya.getState().playbackSpeed
  const idx = speeds.indexOf(current)
  const next = speeds[(idx + 1) % speeds.length]
  setPlaybackSpeed(next)
}

export function setSleepTimer(minutes: number | null): void {
  const now = Date.now()
  const endsAt = minutes && minutes > 0 ? now + minutes * 60 * 1000 : null
  useXimalaya.setState({ sleepTimerMinutes: minutes, sleepTimerEndsAt: endsAt })
}

export function sendVolume(percent: number): void {
  const bounded = Math.max(0, Math.min(1, percent))
  useXimalaya.setState({ volume: bounded })
  sendPlaybackVolume(bounded)
}
export function sendPlaybackVolume(percent: number): void {
  const bounded = Math.max(0, Math.min(1, percent))
  send({ action: 'volume', percent: Math.round(bounded * 100) })
  const audio = getBrowserAudio()
  if (audio) {
    try {
      audio.volume = bounded
    } catch {
      // ignore
    }
  }
}

export function setNowPlaying(open: boolean): void {
  useXimalaya.setState({ nowPlaying: open })
}

export function setQueueOpen(open: boolean): void {
  useXimalaya.setState({ queueOpen: open })
}

export function toggleFavorite(album: ExtendedXimalayaAlbum): void {
  const { favorites } = useXimalaya.getState()
  const exists = favorites.some((f) => f.id === album.id)
  const next = exists ? favorites.filter((f) => f.id !== album.id) : [album, ...favorites]
  try {
    localStorage.setItem('westplay.ximalaya.favorites', JSON.stringify(next))
  } catch {
    // ignore
  }
  useXimalaya.setState({ favorites: next })
}

export function clearHistory(): void {
  try {
    localStorage.removeItem('westplay.ximalaya.history')
  } catch {
    // ignore
  }
  useXimalaya.setState({ history: [] })
}

export function search(query: string): void {
  const clean = query.trim()
  if (!clean) return
  useXimalaya.setState({ searchQuery: clean, searching: true })
  if (IN_HOST) {
    send({ action: 'ask', id: Date.now(), question: { ask: 'search', query: clean } })
  } else {
    // Offline/preview search against all catalogs
    const all = [...MOCK_FEATURED_ALBUMS, ...MOCK_XIANGSHENG_ALBUMS, ...MOCK_STORY_ALBUMS, ...MOCK_RADIO_ALBUMS]
    const matches: ExtendedXimalayaTrack[] = []
    const qLower = clean.toLowerCase()
    for (const alb of all) {
      if (alb.title.toLowerCase().includes(qLower) || alb.artist.toLowerCase().includes(qLower)) {
        const epList = MOCK_ALBUM_TRACKS_MAP[alb.id]
        if (epList && epList.length > 0) {
          matches.push(...epList)
        } else {
          matches.push({
            id: `${alb.id}-s1`,
            title: alb.title,
            artist: alb.artist,
            album: alb.title,
            artwork: alb.artwork,
            duration: 1800,
            url: getAudioUrlForCategory(alb.category || alb.title, matches.length),
          })
        }
      }
    }
    useXimalaya.setState({ searchResults: matches.slice(0, 30), searching: false })
  }
}

export function useXimalayaSource(): { source: MediaSource; artwork: string | null; radio: boolean } | null {
  const playback = useXimalaya((s) => s.playback)
  return useMemo(() => {
    if (!playback) return null
    return {
      artwork: playback.artwork ?? null,
      radio: playback.owner === 'radio',
      source: {
        id: 'westplay-ximalaya',
        service: 'ximalaya',
        title: playback.title,
        artist: playback.artist,
        album: playback.owner === 'radio' ? 'Radio · LIVE' : '喜马拉雅FM',
        live: playback.owner === 'radio',
        artwork: playback.artwork ?? null,
        status: playback.status === 'playing' ? 'playing' : 'paused',
        positionMs: playback.position * 1000,
        positionAt: Date.now(),
        durationMs: playback.duration * 1000,
        controls: { playPause: true, next: true, previous: true, shuffle: false, repeat: false },
        shuffle: false,
        repeat: null,
      },
    }
  }, [playback])
}

/** Release session data while keeping login and player preferences. */
export function releaseResource(): void {
  cancelRadioRequests()
  import('../radio/radio').then((m) => m.resetRadioSession())
  if (browserAudio) {
    try {
      browserAudio.pause?.()
      browserAudio.src = ''
    } catch {
      // ignore
    }
  }
  const before = useXimalaya.getState()
  const kept = {
    signedIn: before.signedIn,
    volume: before.volume,
    playbackSpeed: before.playbackSpeed,
    favorites: before.favorites,
    history: before.history,
  }
  useXimalaya.setState({ ...useXimalaya.getInitialState(), ...kept })
}
