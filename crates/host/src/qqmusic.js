// WestPlay: QQ Music web player controller (crates/host/src/qqmusic.rs).
// Runs in the hidden WebView2 hosting https://y.qq.com/
;(() => {
  if (!location.hostname.includes('y.qq.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  const toHttpsUrl = (url) => (typeof url === 'string' && url ? url.replace(/^http:\/\//i, 'https://') : null)
  const albumCoverUrl = (mid) =>
    mid && String(mid).trim() ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${String(mid).trim()}.jpg` : null
  const singerCoverUrl = (mid) =>
    mid && String(mid).trim() ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${String(mid).trim()}.jpg` : null

  const decodeBase64Utf8 = (input) => {
    if (typeof input !== 'string' || !input) return ''
    // Already plain LRC text (e.g., nobase64=1 fallback)
    if (input.includes('[') && input.includes(']') && !/^[A-Za-z0-9+/=\r\n]+$/.test(input.trim())) {
      return input
    }
    try {
      const cleaned = input.replace(/\s+/g, '')
      const bin = atob(cleaned)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new TextDecoder('utf-8').decode(bytes)
    } catch {
      return input
    }
  }

  const getCookie = (name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : ''
  }

  const computeGtk = (key) => {
    let hash = 5381
    if (key) {
      for (let i = 0; i < key.length; i++) {
        hash += (hash << 5) + key.charCodeAt(i)
      }
    }
    return hash & 0x7fffffff
  }

  const cleanUin = (raw) => {
    if (!raw) return ''
    const digits = String(raw).replace(/^o0*/i, '').replace(/\D+/g, '')
    return digits && digits !== '0' ? digits : ''
  }

  const getAuthInfo = () => {
    const qqmusicKey = getCookie('qqmusic_key')
    const qmKeyst = getCookie('qm_keyst')
    const wxst = getCookie('wxst')
    const pSkey = getCookie('p_skey')
    const skey = getCookie('skey')
    const key = qqmusicKey || qmKeyst || wxst || pSkey || skey || ''
    const uin =
      cleanUin(getCookie('uin')) ||
      cleanUin(getCookie('p_uin')) ||
      cleanUin(getCookie('wxuin')) ||
      cleanUin(getCookie('qqmusic_uin')) ||
      ''
    const hasKey = Boolean(qqmusicKey || qmKeyst || wxst)
    const loginType = wxst && !qqmusicKey && !qmKeyst ? 1 : 2
    return {
      uin,
      key,
      hasAuth: Boolean(hasKey && uin),
      hasKey,
      loginType,
      gtk: computeGtk(key),
    }
  }

  const GUID = (() => {
    const existing = getCookie('pgv_pvid')
    if (existing && /^\d+$/.test(existing)) return existing
    return String(Math.floor(1000000000 + Math.random() * 8999999999))
  })()

  // Pure JS WebCrypto SHA-1 implementation of QQ Music's zzcSign
  const PART_1_INDEXES = [23, 14, 6, 36, 16, 7, 19]
  const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5]
  const SCRAMBLE_VALUES = [
    89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179,
  ]

  const zzcSign = async (payload) => {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
    const raw = new Uint8Array(buf)
    let hash = ''
    const scrambled = new Uint8Array(20)
    for (let i = 0; i < 20; i++) {
      hash += raw[i].toString(16).padStart(2, '0').toUpperCase()
      scrambled[i] = raw[i] ^ SCRAMBLE_VALUES[i]
    }
    const part1 = PART_1_INDEXES.map((i) => hash[i] || '').join('')
    const part2 = PART_2_INDEXES.map((i) => hash[i] || '').join('')
    let bin = ''
    for (let i = 0; i < scrambled.length; i++) bin += String.fromCharCode(scrambled[i])
    const b64Part = btoa(bin).replace(/[+/=]/g, '')
    return `zzc${part1}${b64Part}${part2}`.toLowerCase()
  }

  const fetchJsonSafe = async (url, init) => {
    try {
      const res = await fetch(url, init)
      if (!res.ok) return null
      const text = await res.text()
      if (!text) return null
      // Strip optional JSONP wrapper if a legacy c.y.qq.com endpoint returns one
      const trimmed = text.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return JSON.parse(trimmed)
      }
      const m = trimmed.match(/^[^(]+\(([\s\S]*)\);?$/)
      return m ? JSON.parse(m[1]) : null
    } catch {
      return null
    }
  }

  const musicuRequest = async (requests, options = {}) => {
    const auth = getAuthInfo()
    const comm = {
      cv: 4747474,
      ct: 24,
      format: 'json',
      inCharset: 'utf-8',
      outCharset: 'utf-8',
      notice: 0,
      platform: 'yqq.json',
      needNewCode: 1,
      uin: auth.uin ? Number(auth.uin) || auth.uin : 0,
      g_tk_new_20200303: auth.gtk,
      g_tk: auth.gtk,
      ...(options.comm || {}),
    }
    const body = JSON.stringify({ comm, ...requests })
    if (options.signed) {
      try {
        const sign = await zzcSign(body)
        const signedUrl = `https://u6.y.qq.com/cgi-bin/musics.fcg?_=${Date.now()}&sign=${encodeURIComponent(sign)}`
        const data = await fetchJsonSafe(signedUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        if (data) return data
      } catch {
        // Fallback to unsigned gateway below
      }
    }
    return fetchJsonSafe(`https://u.y.qq.com/cgi-bin/musicu.fcg?_=${Date.now()}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  }

  // Audio playback state
  let sound = null
  let currentAudio = null
  let currentTrack = null
  let isPlaying = false
  let playAttemptSeq = 0
  let reportedFailureSeq = 0
  let endedReportedSeq = 0
  let endedFallbackTimer = null
  let switchingTrack = false

  const clearEndedFallback = () => {
    if (endedFallbackTimer !== null) {
      clearTimeout(endedFallbackTimer)
      endedFallbackTimer = null
    }
  }

  const sendPlayback = (extra = {}) => {
    if (!currentTrack) return
    const audioDur = currentAudio && Number.isFinite(currentAudio.duration) ? currentAudio.duration : 0
    const audioPos = currentAudio && Number.isFinite(currentAudio.currentTime) ? currentAudio.currentTime : 0
    post({
      type: 'playback',
      playback: {
        title: currentTrack.title || '未知歌曲',
        artist: currentTrack.artist || '未知歌手',
        artwork: currentTrack.artwork || null,
        duration: audioDur || currentTrack.duration || 0,
        position: audioPos,
        status: isPlaying ? 'playing' : 'paused',
        ...(currentTrack.id ? { trackId: String(currentTrack.id) } : {}),
        ...extra,
      },
    })
  }

  const emitEnded = (attemptId) => {
    if (switchingTrack || !currentTrack || attemptId !== playAttemptSeq || attemptId === endedReportedSeq) return
    endedReportedSeq = attemptId
    clearEndedFallback()
    isPlaying = false
    const dur =
      Number.isFinite(currentAudio?.duration) && currentAudio.duration > 0
        ? currentAudio.duration
        : currentTrack.duration || 0
    sendPlayback({ status: 'paused', duration: dur, position: dur, error: 'ended' })
  }

  const reportPlaybackFailure = (attemptId, track, reason) => {
    if (!track || attemptId !== playAttemptSeq || attemptId === reportedFailureSeq) return
    clearEndedFallback()
    reportedFailureSeq = attemptId
    isPlaying = false
    if (currentAudio && !currentAudio.paused) {
      try {
        currentAudio.pause()
      } catch {}
    }
    sendPlayback({
      status: 'paused',
      position: 0,
      error: reason || (Number(track.payPlay) === 1 ? 'vip_required' : 'unavailable'),
    })
  }

  const hookAudio = (el) => {
    if (!el || el === currentAudio) return
    currentAudio = el
    if (window.westplayCabSound) {
      sound = window.westplayCabSound(el, (bars) => {
        post({ type: 'spectrum', bars })
      })
    }
    el.addEventListener('play', () => {
      clearEndedFallback()
      endedReportedSeq = 0
      switchingTrack = false
      isPlaying = true
      sendPlayback()
    })
    el.addEventListener('pause', () => {
      if (switchingTrack) return
      const dur = Number.isFinite(el.duration) ? el.duration : 0
      const pos = Number.isFinite(el.currentTime) ? el.currentTime : 0
      const atTrackEnd = Boolean(el.ended) || (dur > 0 && pos >= dur - 0.15)
      if (atTrackEnd) {
        const attemptId = playAttemptSeq
        clearEndedFallback()
        endedFallbackTimer = setTimeout(() => emitEnded(attemptId), 200)
        return
      }
      isPlaying = false
      sendPlayback()
    })
    el.addEventListener('timeupdate', () => {
      if (switchingTrack || !currentTrack || el.ended) return
      sendPlayback()
    })
    el.addEventListener('ended', () => {
      emitEnded(playAttemptSeq)
    })
    el.addEventListener('error', () => {
      clearEndedFallback()
      if (switchingTrack || !currentTrack || !el.getAttribute('src')) return
      const reason = Number(currentTrack.payPlay) === 1 ? 'vip_required' : 'unavailable'
      reportPlaybackFailure(playAttemptSeq, currentTrack, reason)
    })
  }

  const ensureAudio = () => {
    if (currentAudio) return currentAudio
    const created = document.createElement('audio')
    created.id = 'wp-qqmusic-audio'
    created.crossOrigin = 'anonymous'
    document.body.appendChild(created)
    hookAudio(created)
    return created
  }

  // Periodic sign-in & VIP profile check
  let lastStateKey = null
  let userProfile = null
  let profileFetchedUin = ''
  let checkingAccount = false

  const hasDomLogin = () =>
    Boolean(
      document.querySelector('.top_login__cover') ||
        document.querySelector('.js_user_img') ||
        document.querySelector('a.top_login__link img[src]'),
    )

  const checkStatus = async () => {
    const auth = getAuthInfo()
    let signedIn = Boolean(auth.hasAuth || (auth.hasKey && hasDomLogin()))

    if (signedIn && auth.uin && profileFetchedUin !== auth.uin && !checkingAccount) {
      checkingAccount = true
      try {
        const data = await musicuRequest({
          base: {
            module: 'userInfo.BaseUserInfoServer',
            method: 'get_user_baseinfo_v2',
            param: { vec_uin: [auth.uin] },
          },
          vip: {
            module: 'userInfo.VipQueryServer',
            method: 'SRFVipQuery_V2',
            param: { uin_list: [auth.uin] },
          },
        })
        const infoMap = data?.base?.data?.map_userinfo || data?.base?.data?.vec_userinfo
        const baseInfo = Array.isArray(infoMap) ? infoMap[0] : infoMap?.[auth.uin] || Object.values(infoMap || {})[0]
        const vipMap = data?.vip?.data?.infoMap || data?.vip?.data?.map_vipinfo
        const vipInfo = vipMap?.[auth.uin] || Object.values(vipMap || {})[0] || data?.vip?.data

        const nickname = baseInfo?.nick || baseInfo?.nickname || null
        const avatarUrl = toHttpsUrl(baseInfo?.headurl || baseInfo?.logo || baseInfo?.avatar || null)
        const superVip = Number(vipInfo?.iSuperVip ?? vipInfo?.superVip ?? 0)
        const greenVip = Number(vipInfo?.iVipFlag ?? vipInfo?.vipFlag ?? vipInfo?.isVip ?? 0)
        const vipType = superVip > 0 ? 2 : greenVip > 0 ? 1 : 0

        if (nickname || avatarUrl || vipType > 0) {
          userProfile = { nickname, avatarUrl, vipType }
          profileFetchedUin = auth.uin
        }
      } catch {
        // ignore transient network errors
      } finally {
        checkingAccount = false
      }
    }

    if (!signedIn) {
      profileFetchedUin = ''
      userProfile = null
    }

    const statePayload = {
      signedIn,
      playing: isPlaying,
      ...(signedIn && userProfile?.nickname ? { nickname: userProfile.nickname } : {}),
      ...(signedIn && userProfile?.avatarUrl ? { avatarUrl: userProfile.avatarUrl } : {}),
      ...(signedIn && typeof userProfile?.vipType === 'number' ? { vipType: userProfile.vipType } : {}),
    }
    const stateKey = JSON.stringify([
      statePayload.signedIn,
      statePayload.nickname ?? null,
      statePayload.avatarUrl ?? null,
      statePayload.vipType ?? null,
    ])
    if (stateKey !== lastStateKey) {
      lastStateKey = stateKey
      post({ type: 'state', state: statePayload })
    }
  }

  setInterval(() => {
    checkStatus()
  }, 2000)

  const buildStreamUrl = (dataObj) => {
    const infoList = dataObj?.midurlinfo
    const info = Array.isArray(infoList) ? infoList[0] : null
    const purl = typeof info?.purl === 'string' ? info.purl.trim() : ''
    if (!purl) return null
    if (/^https?:\/\//i.test(purl)) return toHttpsUrl(purl)
    const sip =
      (Array.isArray(dataObj?.thirdip) && dataObj.thirdip.find((u) => typeof u === 'string' && u)) ||
      (Array.isArray(dataObj?.sip) && dataObj.sip.find((u) => typeof u === 'string' && u)) ||
      'https://ws6.stream.qqmusic.qq.com/'
    const base = toHttpsUrl(sip) || 'https://ws6.stream.qqmusic.qq.com/'
    const normalizedBase = base.endsWith('/') ? base : `${base}/`
    const normalizedPurl = purl.startsWith('/') ? purl.slice(1) : purl
    return `${normalizedBase}${normalizedPurl}`
  }

  const resolveTrackPlayback = async (track) => {
    if (track.url) return { url: toHttpsUrl(track.url) }
    const songmid = String(track.id || '').trim()
    if (!songmid) return { error: 'unavailable' }
    const mediaMid = String(track.mediaMid || songmid).trim()
    const auth = getAuthInfo()
    const uin = auth.uin || '0'

    // 1. Primary: signed music.vkey.GetEVkey.GetUrl
    const primary = await musicuRequest(
      {
        req_0: {
          module: 'music.vkey.GetEVkey',
          method: 'GetUrl',
          param: {
            guid: GUID,
            songmid: [songmid],
            songtype: [0],
            uin,
            loginflag: 1,
            platform: '20',
            xcdn: 1,
          },
        },
      },
      { signed: true },
    )

    if (primary?.code === 1000 || primary?.req_0?.code === 1000) {
      return { error: 'login_required' }
    }
    const primaryUrl = buildStreamUrl(primary?.req_0?.data)
    if (primaryUrl) return { url: primaryUrl }

    // 2. Fallback: vkey.GetVkeyServer.CgiGetVkey with explicit filenames (C400 m4a / M500 mp3)
    const filenames = [`C400${mediaMid}.m4a`, `M500${mediaMid}.mp3`]
    for (const filename of filenames) {
      const fallback = await musicuRequest(
        {
          req_0: {
            module: 'vkey.GetVkeyServer',
            method: 'CgiGetVkey',
            param: {
              guid: GUID,
              songmid: [songmid],
              songtype: [0],
              filename: [filename],
              uin,
              loginflag: 1,
              platform: '20',
            },
          },
        },
        { signed: true },
      )
      if (fallback?.code === 1000 || fallback?.req_0?.code === 1000) {
        return { error: 'login_required' }
      }
      const url = buildStreamUrl(fallback?.req_0?.data)
      if (url) return { url }
    }

    if (!auth.hasKey) return { error: 'login_required' }
    if (Number(track.payPlay) === 1) return { error: 'vip_required' }
    return { error: 'unavailable' }
  }

  const playTrack = async (track) => {
    const attemptId = ++playAttemptSeq
    clearEndedFallback()
    currentTrack = track
    const audio = ensureAudio()

    switchingTrack = true
    try {
      if (!audio.paused) audio.pause()
      audio.currentTime = 0
    } catch {}

    const resolved = await resolveTrackPlayback(track)
    if (attemptId !== playAttemptSeq) return

    if (!resolved.url) {
      switchingTrack = false
      reportPlaybackFailure(attemptId, track, resolved.error || 'unavailable')
      return
    }

    audio.src = resolved.url
    try {
      audio.load()
    } catch {}
    try {
      await audio.play()
      if (attemptId === playAttemptSeq) {
        switchingTrack = false
      }
    } catch (err) {
      if (attemptId !== playAttemptSeq || err?.name === 'AbortError') return
      switchingTrack = false
      const reason = Number(track.payPlay) === 1 ? 'vip_required' : 'unavailable'
      reportPlaybackFailure(attemptId, track, reason)
    }
  }

  // Data mapping helpers
  const dedupeById = (items) => {
    const seen = new Set()
    const out = []
    for (const item of items) {
      if (!item || !item.id) continue
      const key = String(item.id)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
    return out
  }

  const mapSong = (s, fallbackArtist = '未知歌手') => {
    if (!s || typeof s !== 'object') return null
    const mid = String(s.mid || s.songmid || s.songMid || '').trim()
    if (!mid) return null
    const songIdRaw = s.id ?? s.songid ?? s.songId
    const songId = songIdRaw !== undefined && songIdRaw !== null && String(songIdRaw) !== '0' ? String(songIdRaw) : undefined
    const mediaMid = String(s.file?.media_mid || s.strMediaMid || mid).trim()
    const title = String(s.title || s.name || s.songname || '未知歌曲').trim()
    const singers = Array.isArray(s.singer) ? s.singer : Array.isArray(s.singers) ? s.singers : []
    const artist = singers.map((a) => a?.name || a?.title).filter(Boolean).join(', ') || fallbackArtist
    const albumName = s.album?.name || s.album?.title || s.albumname || ''
    const albumMid = s.album?.mid || s.albummid || ''
    const pmid = s.album?.pmid || ''
    const artwork = pmid
      ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${pmid}.jpg`
      : albumCoverUrl(albumMid)
    const duration = Number(s.interval ?? s.duration ?? 0)
    const rawPayPlay = s.pay?.pay_play ?? s.pay?.payplay ?? 0
    const payPlay = Number.isFinite(Number(rawPayPlay)) ? Number(rawPayPlay) : 0
    return {
      id: mid,
      ...(songId ? { songId } : {}),
      mediaMid,
      title,
      artist,
      album: albumName,
      artwork,
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
      payPlay,
      playable: true,
    }
  }

  const fetchChartSongs = async (topId, num = 50) => {
    const id = Number(topId) || 26
    const data = await musicuRequest({
      req_0: {
        module: 'musicToplist.ToplistInfoServer',
        method: 'GetDetail',
        param: { topId: id, offset: 0, num, period: '' },
      },
    })
    const list = data?.req_0?.data?.songInfoList || data?.req_0?.data?.data?.songInfoList || []
    return dedupeById(list.map((s) => mapSong(s)).filter(Boolean))
  }

  const fetchRecommendPlaylists = async (size = 12) => {
    const data = await musicuRequest({
      req_0: {
        module: 'music.playlist.PlaylistSquare',
        method: 'GetRecommendFeed',
        param: { From: 0, Size: size },
      },
    })
    const rawList = data?.req_0?.data?.List || data?.req_0?.data?.list || data?.req_0?.data?.v_playlist || []
    const mapped = rawList
      .map((item) => {
        const basic = item?.Playlist?.basic || item?.basic || item
        const id = basic?.tid ?? basic?.content_id ?? basic?.dissid ?? basic?.id
        if (!id) return null
        const cover =
          basic?.cover?.medium_url ||
          basic?.cover?.default_url ||
          basic?.cover?.big_url ||
          basic?.cover_url_medium ||
          basic?.imgurl ||
          null
        return {
          id: String(id),
          name: basic?.title || basic?.dissname || '推荐歌单',
          coverImgUrl: toHttpsUrl(cover),
          trackCount: Number(basic?.song_cnt ?? basic?.songnum ?? 0) || 0,
          playCount: Number(basic?.play_cnt ?? basic?.listen_num ?? basic?.access_num ?? 0) || undefined,
        }
      })
      .filter(Boolean)
    return dedupeById(mapped)
  }

  const fetchPlaylistTracks = async (playlistId, limit = 100) => {
    const pid = String(playlistId || '').trim()
    if (!pid) return []
    const numericId = Number(pid)
    const data = await musicuRequest({
      req_0: {
        module: 'music.srfDissInfo.aiDissInfo',
        method: 'uniform_get_Dissinfo',
        param: {
          disstid: Number.isFinite(numericId) && numericId > 0 ? numericId : pid,
          userinfo: 1,
          tag: 1,
          is_pc: 1,
          guid: GUID,
          song_begin: 0,
          song_num: limit,
          onlysonglist: 0,
          orderlist: true,
        },
      },
    })
    const list = data?.req_0?.data?.songlist || data?.req_0?.data?.cdlist?.[0]?.songlist || []
    if (Array.isArray(list) && list.length > 0) {
      return dedupeById(list.map((s) => mapSong(s, '群星')).filter(Boolean))
    }

    // Legacy fallback
    const auth = getAuthInfo()
    const legacy = await fetchJsonSafe(
      `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${encodeURIComponent(pid)}&g_tk=${auth.gtk}&format=json&inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0`,
      { credentials: 'include' },
    )
    const legacyList = legacy?.cdlist?.[0]?.songlist || []
    return dedupeById(legacyList.map((s) => mapSong(s, '群星')).filter(Boolean))
  }

  const fetchUserPlaylists = async () => {
    const auth = getAuthInfo()
    if (!auth.uin) return []
    const created = []
    const collected = []

    // 1. Created playlists (includes dirid: 201 "我喜欢")
    const createdRes = await musicuRequest({
      req_0: {
        module: 'music.musicasset.PlaylistBaseRead',
        method: 'GetPlaylistByUin',
        param: { uin: auth.uin },
      },
    })
    const vPlaylist = createdRes?.req_0?.data?.v_playlist || []
    for (const p of vPlaylist) {
      const tid = p?.tid ?? p?.dissid
      if (!tid || String(tid) === '0') continue
      created.push({
        id: String(tid),
        name: p?.dirName || p?.diss_name || (Number(p?.dirId) === 201 ? '我喜欢' : '自建歌单'),
        coverImgUrl: toHttpsUrl(p?.picUrl || p?.picurl || p?.diss_cover || null),
        trackCount: Number(p?.songNum ?? p?.song_cnt ?? 0) || 0,
        playCount: Number(p?.listenNum ?? p?.listen_num ?? 0) || undefined,
        subscribed: false,
      })
    }

    if (created.length === 0) {
      const legacyCreated = await fetchJsonSafe(
        `https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?r=${Date.now()}&hostuin=${encodeURIComponent(auth.uin)}&sin=0&size=50&g_tk=${auth.gtk}&format=json&inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0`,
        { credentials: 'include' },
      )
      const disslist = legacyCreated?.data?.disslist || []
      for (const p of disslist) {
        const tid = p?.tid ?? p?.dissid
        if (!tid || String(tid) === '0') continue
        created.push({
          id: String(tid),
          name: p?.diss_name || (Number(p?.dirid) === 201 ? '我喜欢' : '自建歌单'),
          coverImgUrl: toHttpsUrl(p?.diss_cover || null),
          trackCount: Number(p?.song_cnt ?? 0) || 0,
          playCount: Number(p?.listen_num ?? 0) || undefined,
          subscribed: false,
        })
      }
    }

    // 2. Collected playlists (reqtype=3)
    const favRes = await fetchJsonSafe(
      `https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?g_tk=${auth.gtk}&loginUin=${encodeURIComponent(auth.uin)}&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&ct=20&cid=205360956&userid=${encodeURIComponent(auth.uin)}&reqtype=3&sin=0&ein=50`,
      { credentials: 'include' },
    )
    const favList = favRes?.data?.cdlist || favRes?.data?.list || []
    for (const p of favList) {
      const tid = p?.dissid ?? p?.tid
      if (!tid || String(tid) === '0') continue
      collected.push({
        id: String(tid),
        name: p?.dissname || p?.title || '收藏歌单',
        coverImgUrl: toHttpsUrl(p?.logo || p?.picurl || null),
        trackCount: Number(p?.songnum ?? p?.song_cnt ?? 0) || 0,
        playCount: Number(p?.listennum ?? 0) || undefined,
        subscribed: true,
      })
    }

    return dedupeById([...created, ...collected])
  }

  const fetchRadios = async () => {
    const data = await musicuRequest({
      req_0: {
        module: 'pf.radiosvr',
        method: 'GetRadiolist',
        param: { ct: '24' },
      },
    })
    const groups = data?.req_0?.data?.radio_list || []
    const radios = []
    for (const group of groups) {
      const groupName = group?.name || '随心听'
      const list = Array.isArray(group?.list) ? group.list : []
      for (const r of list) {
        const rid = r?.id ?? r?.radioId
        if (!rid || Number(rid) === 99) continue
        radios.push({
          id: String(rid),
          name: r?.title || r?.name || '随心听电台',
          picUrl: toHttpsUrl(r?.pic_url || r?.picUrl || null),
          djName: groupName,
          programCount: 0,
          subCount: Number.isFinite(Number(r?.listenNum)) ? Number(r.listenNum) : undefined,
        })
      }
    }
    return dedupeById(radios)
  }

  const fetchRadioSongs = async (radioId) => {
    const rid = Number(radioId) || 101
    const data = await musicuRequest({
      req_0: {
        module: 'pf.radiosvr',
        method: 'GetRadiosonglist',
        param: { id: rid, firstplay: 1, num: 30 },
      },
    })
    const list = data?.req_0?.data?.tracks || data?.req_0?.data?.track_list || []
    return dedupeById(list.map((s) => mapSong(s)).filter(Boolean))
  }

  const fetchUserArtists = async () => {
    const auth = getAuthInfo()
    if (!auth.uin) return []
    const data = await fetchJsonSafe(
      `https://c.y.qq.com/rsc/fcgi-bin/fcg_user_follow_singer.fcg?g_tk=${auth.gtk}&loginUin=${encodeURIComponent(auth.uin)}&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&uin=${encodeURIComponent(auth.uin)}&sin=0&ein=50`,
      { credentials: 'include' },
    )
    const list = data?.data?.list || []
    return dedupeById(
      list
        .map((a) => {
          const mid = String(a?.singermid || a?.mid || '').trim()
          if (!mid) return null
          return {
            id: mid,
            name: a?.singername || a?.name || '未知歌手',
            picUrl: toHttpsUrl(a?.pic || singerCoverUrl(mid)),
            albumSize: Number.isFinite(Number(a?.albumnum)) ? Number(a.albumnum) : undefined,
            musicSize: Number.isFinite(Number(a?.songnum)) ? Number(a.songnum) : undefined,
          }
        })
        .filter(Boolean),
    )
  }

  const fetchArtistSongs = async (artistMid) => {
    const mid = String(artistMid || '').trim()
    if (!mid) return []
    const data = await musicuRequest({
      req_0: {
        module: 'music.web_singer_info_svr',
        method: 'get_singer_detail_info',
        param: { singermid: mid, sin: 0, num: 50, order: 1 },
      },
    })
    const fallbackName = data?.req_0?.data?.singer_info?.name || '未知歌手'
    const list = data?.req_0?.data?.songlist || []
    return dedupeById(list.map((s) => mapSong(s, fallbackName)).filter(Boolean))
  }

  const fetchLyrics = async (songmid, songId) => {
    const mid = String(songmid || '').trim()
    if (!mid) return ''
    const numericSongId = Number(songId) || 0
    const data = await musicuRequest({
      req_0: {
        module: 'music.musichallSong.PlayLyricInfo',
        method: 'GetPlayLyricInfo',
        param: {
          songMID: mid,
          ...(numericSongId > 0 ? { songID: numericSongId } : {}),
          trans: 0,
          roma: 0,
          lrc_t: 0,
          crypt: 0,
          qrc: 0,
        },
      },
    })
    const rawLrc = data?.req_0?.data?.lyric
    if (typeof rawLrc === 'string' && rawLrc.trim()) {
      return decodeBase64Utf8(rawLrc)
    }

    const auth = getAuthInfo()
    const legacy = await fetchJsonSafe(
      `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(mid)}&g_tk=${auth.gtk}&format=json&inCharset=utf8&outCharset=utf-8&nobase64=1&platform=yqq.json&needNewCode=0`,
      { credentials: 'include' },
    )
    if (typeof legacy?.lyric === 'string' && legacy.lyric.trim()) {
      return decodeBase64Utf8(legacy.lyric)
    }
    return ''
  }

  const handleAsk = async (id, question) => {
    try {
      if (question.ask === 'search') {
        const data = await musicuRequest(
          {
            req_0: {
              module: 'music.search.SearchCgiService',
              method: 'DoSearchForQQMusicDesktop',
              param: {
                query: String(question.query || '').trim(),
                search_type: 0,
                num_per_page: 30,
                page_num: 1,
                remoteplace: 'txt.yqq.song',
              },
            },
          },
          { comm: { ct: 19, cv: 1859 } },
        )
        const list = data?.req_0?.data?.body?.song?.list || []
        const songs = dedupeById(list.map((s) => mapSong(s)).filter(Boolean))
        post({ type: 'answer', answer: { id, songs } })
      } else if (question.ask === 'recommend') {
        const [songs, playlists] = await Promise.all([fetchChartSongs(26, 50), fetchRecommendPlaylists(12)])
        post({
          type: 'answer',
          answer: { id, songs, playlists: playlists.length > 0 ? playlists : undefined },
        })
      } else if (question.ask === 'chart') {
        const songs = await fetchChartSongs(question.id || '26', 50)
        post({ type: 'answer', answer: { id, songs } })
      } else if (question.ask === 'userPlaylists') {
        const playlists = await fetchUserPlaylists()
        post({ type: 'answer', answer: { id, playlists } })
      } else if (question.ask === 'playlistTracks') {
        const songs = await fetchPlaylistTracks(question.playlistId, 100)
        post({ type: 'answer', answer: { id, songs } })
      } else if (question.ask === 'radios') {
        const radios = await fetchRadios()
        post({ type: 'answer', answer: { id, radios } })
      } else if (question.ask === 'radioSongs') {
        const songs = await fetchRadioSongs(question.radioId)
        post({ type: 'answer', answer: { id, songs } })
      } else if (question.ask === 'userArtists') {
        const artists = await fetchUserArtists()
        post({ type: 'answer', answer: { id, artists } })
      } else if (question.ask === 'artistSongs') {
        const songs = await fetchArtistSongs(question.artistId)
        post({ type: 'answer', answer: { id, songs } })
      } else if (question.ask === 'lyrics') {
        const lyric = await fetchLyrics(question.id, question.songId)
        post({ type: 'answer', answer: { id, lyric } })
      }
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err) } })
    }
  }

  const handleHost = async (cmd) => {
    if (!cmd || typeof cmd !== 'object') return
    const { action } = cmd

    if (action === 'play') {
      if (cmd.track) {
        await playTrack(cmd.track)
      } else if (currentAudio && currentAudio.getAttribute('src') && !currentAudio.error) {
        const attemptId = currentAudio.ended ? ++playAttemptSeq : playAttemptSeq
        clearEndedFallback()
        try {
          if (currentAudio.ended) {
            endedReportedSeq = 0
            currentAudio.currentTime = 0
          }
          await currentAudio.play()
        } catch (err) {
          if (attemptId !== playAttemptSeq || err?.name === 'AbortError') return
          if (currentTrack) await playTrack(currentTrack)
        }
      } else if (currentTrack) {
        await playTrack(currentTrack)
      }
    } else if (action === 'pause') {
      clearEndedFallback()
      switchingTrack = false
      if (currentAudio) currentAudio.pause()
    } else if (action === 'seek') {
      if (currentAudio && typeof cmd.seconds === 'number') {
        clearEndedFallback()
        endedReportedSeq = 0
        currentAudio.currentTime = cmd.seconds
      }
    } else if (action === 'volume') {
      if (currentAudio && typeof cmd.percent === 'number') {
        currentAudio.volume = Math.max(0, Math.min(1, cmd.percent / 100))
      }
    } else if (action === 'ask') {
      handleAsk(cmd.id, cmd.question)
    }
  }

  const handleMessage = (data) => {
    try {
      const cmd = typeof data === 'string' ? JSON.parse(data) : data
      handleHost(cmd)
    } catch (e) {
      console.error('[qqmusic] handleMessage error', e)
    }
  }

  window.chrome?.webview?.addEventListener('message', (event) => handleMessage(event.data))
  window.addEventListener('message', (event) => handleMessage(event.data))
  window.chrome?.webview?.postMessage({ ready: true })

  window.westplayQqmusicCommand = (cmd) => {
    handleHost(cmd)
  }

  const fetchInitialTopTracks = async () => {
    try {
      const [songs, playlists] = await Promise.all([fetchChartSongs(26, 30), fetchRecommendPlaylists(12)])
      if (songs.length > 0 || playlists.length > 0) {
        post({
          type: 'answer',
          answer: {
            id: 0,
            ...(songs.length > 0 ? { songs } : {}),
            ...(playlists.length > 0 ? { playlists } : {}),
          },
        })
      }
    } catch (e) {
      console.error('[qqmusic] auto fetch initial tracks error', e)
    }
  }

  checkStatus()
  fetchInitialTopTracks()
})()
