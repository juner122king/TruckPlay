import type {
  BilibiliAnswers,
  BilibiliChannel,
  BilibiliDynamicItem,
  BilibiliLiveRoom,
  BilibiliMovieItem,
  BilibiliQuestion,
  BilibiliVideo,
  BilibiliVideoPage,
} from '../../../shared/host'

export const MOCK_VIDEOS: BilibiliVideo[] = [
  {
    bvid: 'BV1xx411c7mD',
    title: '【经典】甩葱歌 初音未来 高清重制',
    author: '初音未来官方',
    mid: '1',
    duration: 154,
    playCount: '1250万',
    pubdate: '2020-01-01',
    artwork: 'https://i0.hdslb.com/bfs/archive/478a846c4fce45be5d120a1dbde86b72f10b7776.jpg',
  },
  {
    bvid: 'BV1GJ411x7h7',
    title: '【卡车司机的一天】驾驶斯堪尼亚穿越阿尔卑斯山脉',
    author: '欧卡达人',
    mid: '2',
    duration: 840,
    playCount: '89万',
    pubdate: '2023-05-12',
    artwork: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
  },
  {
    bvid: 'BV185411r7Kd',
    title: '周杰伦 经典金曲串烧 4K 60帧 车载无损',
    author: '音乐车道',
    mid: '3',
    duration: 1200,
    playCount: '345万',
    pubdate: '2022-10-08',
    artwork: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
  },
  {
    bvid: 'BV1t4411v7r5',
    title: '【4K沉浸式】雨夜长途驾驶 欧洲卡车模拟2 真实视听',
    author: 'SimDriver',
    mid: '4',
    duration: 1800,
    playCount: '67万',
    pubdate: '2023-11-20',
    artwork: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
  },
  {
    bvid: 'BV1uT4y1P7cx',
    title: '【4K60帧】中国高铁驾驶视角 穿越大好河山',
    author: '铁道视界',
    mid: '5',
    duration: 960,
    playCount: '190万',
    pubdate: '2024-03-15',
    artwork: 'https://i1.hdslb.com/bfs/archive/844781604a8b75249c3ce3882756885df1aeb6c4.jpg',
  },
  {
    bvid: 'BV1QK4y1d7Ng',
    title: '欧卡2 超重特种货物运输 挑战极限弯道',
    author: '重卡领航员',
    mid: '6',
    duration: 720,
    playCount: '45万',
    pubdate: '2024-08-01',
    artwork: 'https://i2.hdslb.com/bfs/archive/a64a377d61247d51fce8ba0722cb54c414e049bf.jpg',
  },
]

const MOCK_CHANNELS: BilibiliChannel[] = [
  {
    mid: '2',
    name: '欧卡达人',
    avatar: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
    sign: '专注欧洲卡车模拟2 / 美卡风景驾驶与长途运输实况',
    fans: '42.6万',
    videos: '184',
    subscribed: false,
  },
  {
    mid: '3',
    name: '音乐车道',
    avatar: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
    sign: '长途车载无损歌单、深夜公路电台精选',
    fans: '118.2万',
    videos: '312',
    subscribed: true,
  },
  {
    mid: '4',
    name: 'SimDriver',
    avatar: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
    sign: '拟真驾驶爱好者，4K 60帧座舱第一视角',
    fans: '26.1万',
    videos: '96',
    subscribed: false,
  },
  {
    mid: '5',
    name: '铁道视界',
    avatar: 'https://i1.hdslb.com/bfs/archive/844781604a8b75249c3ce3882756885df1aeb6c4.jpg',
    sign: '各地铁路与公路风景慢直播',
    fans: '75.4万',
    videos: '219',
    subscribed: false,
  },
]

const MOCK_DYNAMICS: BilibiliDynamicItem[] = [
  {
    id: 'dyn-1',
    author: {
      mid: '2',
      name: '欧卡达人',
      avatar: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
      pubTime: '10分钟前',
      pubAction: '投稿了视频',
    },
    desc: '新的一期欧洲卡车长途拉货视频来啦！这次从瑞士苏黎世一路开到奥地利因斯布鲁克，沿途的阿尔卑斯雪山景色绝美，配上雨夜驾驶音效，非常适合开车时当背景音，希望大家喜欢！',
    video: MOCK_VIDEOS[1],
  },
  {
    id: 'dyn-2',
    author: {
      mid: '4',
      name: 'SimDriver',
      avatar: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
      pubTime: '2小时前',
      pubAction: '发布了动态',
    },
    desc: '今晚8点准时开启欧卡2联运直播，届时会穿越北欧峡湾，欢迎大家一起来跑车交流！路线规划已准备完毕。',
  },
  {
    id: 'dyn-3',
    author: {
      mid: '3',
      name: '音乐车道',
      avatar: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
      pubTime: '昨天 19:40',
      pubAction: '转发了动态',
    },
    desc: '转自原UP主的经典金曲串烧，车载听感无敌，强烈推荐各位车友收藏播放！',
    origAuthor: '初音未来官方',
    origDesc: '初音未来经典神曲高清重制版发布！感谢大家一直以来的支持~',
    video: MOCK_VIDEOS[0],
  },
]

const MOCK_FOLLOWING_LIVE: BilibiliLiveRoom[] = [
  {
    roomId: 1001,
    uid: 2,
    title: '【欧卡2】阿尔卑斯暴风雪连夜拉货 沉浸式驾驶',
    uname: '欧卡达人',
    avatar: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
    cover: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
    areaName: '单机·卡车模拟',
    parentAreaName: '单机游戏',
    online: '12.8万',
    isFollowing: true,
  },
  {
    roomId: 1002,
    uid: 3,
    title: '车载无损无眠电台 治愈系深夜畅听',
    uname: '音乐车道',
    avatar: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
    cover: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
    areaName: '电台·音乐',
    parentAreaName: '语音电台',
    online: '8.4万',
    isFollowing: true,
  },
]

const MOCK_CATEGORY_LIVE: Record<number, BilibiliLiveRoom[]> = {
  6: [
    {
      roomId: 2001,
      uid: 101,
      title: '【极限竞速地平线5】漫游墨西哥海岸线 4K超清',
      uname: '极速车神',
      avatar: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
      cover: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
      areaName: '极限竞速',
      parentAreaName: '单机游戏',
      online: '25.6万',
      isFollowing: false,
    },
    {
      roomId: 2002,
      uid: 102,
      title: '重卡领航：北欧峡湾跨国联运 实时路况',
      uname: '重卡老张',
      avatar: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
      cover: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
      areaName: '卡车模拟',
      parentAreaName: '单机游戏',
      online: '19.3万',
      isFollowing: false,
    },
    {
      roomId: 2003,
      uid: 103,
      title: '黑神话悟空：二周目全隐藏Boss速通',
      uname: '天命行者',
      avatar: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
      cover: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
      areaName: '动作游戏',
      parentAreaName: '单机游戏',
      online: '45.1万',
      isFollowing: false,
    },
  ],
  2: [
    {
      roomId: 2011,
      uid: 111,
      title: '【英雄联盟】王者单排冲分！中路亚索教学',
      uname: '风之剑圣',
      avatar: 'https://i2.hdslb.com/bfs/archive/a64a377d61247d51fce8ba0722cb54c414e049bf.jpg',
      cover: 'https://i2.hdslb.com/bfs/archive/a64a377d61247d51fce8ba0722cb54c414e049bf.jpg',
      areaName: '英雄联盟',
      parentAreaName: '网游竞技',
      online: '88.5万',
      isFollowing: false,
    },
    {
      roomId: 2012,
      uid: 112,
      title: 'CS2 完美S分段狙击实况 瞬狙教学',
      uname: '狙击手老陈',
      avatar: 'https://i1.hdslb.com/bfs/archive/844781604a8b75249c3ce3882756885df1aeb6c4.jpg',
      cover: 'https://i1.hdslb.com/bfs/archive/844781604a8b75249c3ce3882756885df1aeb6c4.jpg',
      areaName: 'CS:GO/CS2',
      parentAreaName: '网游竞技',
      online: '52.3万',
      isFollowing: false,
    },
  ],
  3: [
    {
      roomId: 2021,
      uid: 121,
      title: '王者荣耀：巅峰赛2300分 顶尖打野全局意识',
      uname: '野王小亮',
      avatar: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
      cover: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
      areaName: '王者荣耀',
      parentAreaName: '手机游戏',
      online: '63.9万',
      isFollowing: false,
    },
    {
      roomId: 2022,
      uid: 122,
      title: '原神：新版本深渊满星阵容实战讲解',
      uname: '提瓦特导师',
      avatar: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
      cover: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
      areaName: '原神',
      parentAreaName: '手机游戏',
      online: '41.2万',
      isFollowing: false,
    },
  ],
  9: [
    {
      roomId: 2031,
      uid: 131,
      title: '【歌回】温柔治愈系日韩流行金曲连唱',
      uname: '星奈Kina',
      avatar: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
      cover: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
      areaName: '虚拟主播',
      parentAreaName: '虚拟主播',
      online: '38.0万',
      isFollowing: false,
    },
  ],
  1: [
    {
      roomId: 2041,
      uid: 141,
      title: '流行经典暖心现场 一起听歌聊聊生活',
      uname: '深夜点歌台',
      avatar: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
      cover: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
      areaName: '娱乐日常',
      parentAreaName: '娱乐',
      online: '16.7万',
      isFollowing: false,
    },
  ],
  5: [
    {
      roomId: 2051,
      uid: 151,
      title: '晚安电台：雨声与白噪音 深度助眠',
      uname: '知心树洞',
      avatar: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
      cover: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
      areaName: '语音电台',
      parentAreaName: '电台',
      online: '9.4万',
      isFollowing: false,
    },
  ],
}

const MOCK_MOVIES: Record<number, BilibiliMovieItem[]> = {
  2: [
    {
      seasonId: 48001,
      title: '剧场版 咒术回战 0',
      subTitle: '爱与诅咒的物语',
      cover: 'https://i0.hdslb.com/bfs/bangumi/image/0082a5c243151ef989439578e745785268c58e7d.png',
      badge: '大会员',
      score: '8.8',
      indexShow: '全1话',
      order: '1342.2万追番',
      link: 'https://www.bilibili.com/bangumi/play/ss48001?theme=movie',
      epId: 826152,
    },
    {
      seasonId: 38744,
      title: '工作细胞：细胞大作战',
      subTitle: '王者归来，胃肠大暴动！',
      cover: 'https://i0.hdslb.com/bfs/bangumi/image/3beae497c35df1782eef1108210fe521a02d4560.png',
      badge: '独家',
      score: '9.2',
      indexShow: '全1话',
      order: '340万追番',
      link: 'https://www.bilibili.com/bangumi/play/ss38744',
      epId: 404859,
    },
    {
      seasonId: 36780,
      title: '紫罗兰永恒花园 剧场版',
      subTitle: '最后的信笺，献给深爱之人',
      cover: 'https://i0.hdslb.com/bfs/bangumi/image/1f4dce1fbb26c3683f124c653457a419eb502390.png',
      badge: '独家',
      score: '9.9',
      indexShow: '全1话',
      order: '680万追番',
      link: 'https://www.bilibili.com/bangumi/play/ss36780',
      epId: 395893,
    },
  ],
  5: [
    {
      seasonId: 28243,
      title: '非自然死亡',
      subTitle: '石原里美主演高分法医悬疑日剧',
      cover: 'https://i0.hdslb.com/bfs/bangumi/image/f1860d5bfa7ee23c72718e24c29ea7ea1f0cbe0a.png',
      badge: '大会员',
      score: '9.9',
      indexShow: '全10集',
      order: '1.2亿播放',
      link: 'https://www.bilibili.com/bangumi/play/ss28243',
      epId: 284241,
    },
    {
      seasonId: 24053,
      title: '孤独的美食家 第七季',
      subTitle: '井之头五郎的舌尖治愈之旅',
      cover: 'https://i0.hdslb.com/bfs/bangumi/72f01ec71e4e8cb1a765f875b7a26fb78b9ae6eb.jpg',
      badge: '大会员',
      score: '9.9',
      indexShow: '全12集',
      order: '8800万播放',
      link: 'https://www.bilibili.com/bangumi/play/ss24053',
      epId: 204577,
    },
  ],
  3: [
    {
      seasonId: 34220,
      title: '守护解放西',
      subTitle: '硬核又接地气的警务纪实',
      cover: 'https://i0.hdslb.com/bfs/bangumi/image/ef179dc1784c0c16928e46eb58f5d165682b9e67.png',
      badge: '出品',
      score: '9.8',
      indexShow: '全10集',
      order: '4800万播放',
      link: 'https://www.bilibili.com/bangumi/play/ss34220',
      epId: 341852,
    },
    {
      seasonId: 24659,
      title: '人生一串 第一季',
      subTitle: '致我们七荤八素的生存',
      cover: 'https://i0.hdslb.com/bfs/bangumi/image/9e7e1f4bbd1469f3fe26859e92823b1859bb0f45.png',
      badge: '出品',
      score: '9.8',
      indexShow: '全6集',
      order: '2.5亿播放',
      link: 'https://www.bilibili.com/bangumi/play/ss24659',
      epId: 232230,
    },
  ],
  7: [
    {
      seasonId: 39396,
      title: '非正式会谈 第7季',
      subTitle: '全球青年文化交流沙龙',
      cover: 'https://i0.hdslb.com/bfs/bangumi/image/62e5b8e99818816c1417e29bb3e66052796dc612.png',
      badge: '独家',
      score: '9.6',
      indexShow: '全14期',
      order: '1.8亿播放',
      link: 'https://www.bilibili.com/bangumi/play/ss39396',
      epId: 474812,
    },
  ],
  1: [
    {
      seasonId: 39250,
      title: '鬼灭之刃 游郭篇',
      subTitle: '炭治郎与音柱潜入花街',
      cover: 'https://i0.hdslb.com/bfs/bangumi/image/dcf4c6f393ee3a6cb4723c2140d34633d77d1ca4.png',
      badge: '独家',
      score: '9.7',
      indexShow: '全11话',
      order: '1200万追番',
      link: 'https://www.bilibili.com/bangumi/play/ss39250',
      epId: 429643,
    },
    {
      seasonId: 47836,
      title: '间谍过家家 第二季',
      subTitle: '为了世界和平，伪装家庭继续行动',
      cover: 'https://i0.hdslb.com/bfs/bangumi/image/07a4ec8e2a95558a99859e1e374fe4b634e47aaf.png',
      badge: '大会员',
      score: '9.7',
      indexShow: '全12话',
      order: '1770万追番',
      link: 'https://www.bilibili.com/bangumi/play/ss47836',
      epId: 826497,
    },
  ],
}

function rotateVideos(offset = 0): BilibiliVideo[] {
  const shift = ((offset % MOCK_VIDEOS.length) + MOCK_VIDEOS.length) % MOCK_VIDEOS.length
  return shift > 0 ? [...MOCK_VIDEOS.slice(shift), ...MOCK_VIDEOS.slice(0, shift)] : MOCK_VIDEOS
}

export function getMockAnswer(question: BilibiliQuestion): BilibiliAnswers {
  switch (question.ask) {
    case 'suggest': {
      const q = question.query.trim()
      return { suggestions: q ? [`${q} 欧卡`, `${q} 4K`, `${q} 驾驶`, `${q} 无损`] : [] }
    }
    case 'feed': {
      if (question.which === 'dynamic') {
        return { dynamics: MOCK_DYNAMICS, videos: rotateVideos(question.freshIdx), hasMore: false }
      }
      return { videos: rotateVideos(question.freshIdx), hasMore: false }
    }
    case 'popular':
    case 'recommend': {
      return { videos: rotateVideos(question.freshIdx), hasMore: false }
    }
    case 'live': {
      const parentAreaId = question.parentAreaId ?? 0
      const liveRooms =
        parentAreaId > 0 && MOCK_CATEGORY_LIVE[parentAreaId]
          ? MOCK_CATEGORY_LIVE[parentAreaId]
          : Object.values(MOCK_CATEGORY_LIVE).flat()
      return {
        followingLiveRooms: question.page === 1 ? MOCK_FOLLOWING_LIVE : undefined,
        liveRooms,
        hasMore: false,
      }
    }
    case 'movie': {
      const seasonType = question.seasonType ?? 2
      return {
        movies: MOCK_MOVIES[seasonType] || MOCK_MOVIES[2],
        hasMore: false,
      }
    }
    case 'search': {
      const q = question.query.trim().toLowerCase()
      if (question.filter === 'users') {
        const matched = MOCK_CHANNELS.filter(
          (ch) => ch.name.toLowerCase().includes(q) || ch.sign?.toLowerCase().includes(q),
        )
        return { channels: matched.length > 0 ? matched : MOCK_CHANNELS, hasMore: false }
      }
      const matched = MOCK_VIDEOS.filter((v) => v.title.toLowerCase().includes(q) || v.author.toLowerCase().includes(q))
      return { videos: matched.length > 0 ? matched : MOCK_VIDEOS, hasMore: false }
    }
    case 'channel': {
      const found = MOCK_CHANNELS.find((ch) => ch.mid === question.mid) ?? {
        mid: question.mid,
        name: MOCK_VIDEOS.find((v) => v.mid === question.mid)?.author ?? 'UP主',
        fans: '12.3万',
        videos: '36',
        subscribed: false,
      }
      const vids = MOCK_VIDEOS.filter((v) => v.mid === question.mid)
      return { channel: found, videos: vids.length > 0 ? vids : MOCK_VIDEOS.slice(0, 4), hasMore: false }
    }
    case 'playlist': {
      const pages: BilibiliVideoPage[] = [
        { cid: 101, page: 1, part: '启程与车辆整备', duration: 310 },
        { cid: 102, page: 2, part: '阿尔卑斯盘山公路实况', duration: 530 },
      ]
      return { pages }
    }
    case 'related': {
      return { videos: MOCK_VIDEOS.filter((v) => v.bvid !== question.bvid) }
    }
    case 'subscribe': {
      return { channel: { mid: question.mid, name: '', subscribed: question.on } }
    }
  }
}
