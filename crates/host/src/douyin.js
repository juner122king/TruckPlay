// WestPlay: Douyin short video controller (crates/host/src/douyin.rs).
// Runs in the hidden WebView2 hosting https://www.douyin.com/ (and in its same-origin harvester iframe).
;(() => {
  if (!location.hostname.includes('douyin.com')) return

  const isTop = window.top === window
  const isHarvester = !isTop && typeof window.name === 'string' && window.name.startsWith('wp_douyin_loader:')
  if (!isTop && !isHarvester) return

  const CHANNEL_URLS = {
    recommend: 'https://www.douyin.com/?recommend=1',
    jingxuan: 'https://www.douyin.com/jingxuan',
    follow: 'https://www.douyin.com/follow',
    hot: 'https://www.douyin.com/hot',
    knowledge: 'https://www.douyin.com/channel/300203',
    music: 'https://www.douyin.com/channel/300209',
    film: 'https://www.douyin.com/channel/300215',
    food: 'https://www.douyin.com/channel/300204',
    game: 'https://www.douyin.com/channel/300205',
    sports: 'https://www.douyin.com/channel/300207',
    entertainment: 'https://www.douyin.com/channel/300201',
    anime: 'https://www.douyin.com/channel/300206',
  }

  const toNonNegInt = (val) => {
    const n = Number(val)
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined
  }

  const toHttps = (u) => {
    if (typeof u !== 'string') return null
    const trimmed = u.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('//')) return `https:${trimmed}`
    if (trimmed.startsWith('http://')) return `https://${trimmed.slice(7)}`
    if (trimmed.startsWith('https://')) return trimmed
    return null
  }

  const firstUrl = (obj) => {
    if (!obj) return null
    if (typeof obj === 'string') return toHttps(obj)
    const list = obj.url_list || obj.urlList || obj.url_list_v2
    if (Array.isArray(list)) {
      for (const item of list) {
        const u = toHttps(item)
        if (u) return u
      }
    }
    return null
  }

  const extractPlayUrls = (videoObj) => {
    if (!videoObj || typeof videoObj !== 'object') return []
    const h264Urls = []
    const otherUrls = []
    const pushFrom = (addr, target) => {
      const list = addr?.url_list || addr?.urlList
      if (!Array.isArray(list)) return
      for (const raw of list) {
        const u = toHttps(raw)
        if (u && !u.includes('watermark=1') && !target.includes(u)) target.push(u)
      }
    }

    if (Array.isArray(videoObj.bit_rate) && videoObj.bit_rate.length > 0) {
      const sorted = [...videoObj.bit_rate].sort((a, b) => {
        const aH264 = a?.is_h265 === 0 || a?.is_bytevc1 === 0 ? 1 : 0
        const bH264 = b?.is_h265 === 0 || b?.is_bytevc1 === 0 ? 1 : 0
        if (aH264 !== bH264) return bH264 - aH264
        return (Number(b?.bit_rate) || 0) - (Number(a?.bit_rate) || 0)
      })
      for (const entry of sorted) {
        const isH264 =
          entry?.is_h265 === 0 || entry?.is_bytevc1 === 0 || /avc|h264/i.test(String(entry?.gear_name || ''))
        pushFrom(entry?.play_addr, isH264 ? h264Urls : otherUrls)
      }
    }

    pushFrom(videoObj.play_addr_h264, h264Urls)
    pushFrom(videoObj.play_addr, h264Urls)
    pushFrom(videoObj.play_addr_265, otherUrls)
    pushFrom(videoObj.download_addr, otherUrls)

    const merged = [...h264Urls]
    for (const u of otherUrls) {
      if (!merged.includes(u)) merged.push(u)
    }
    merged.sort((a, b) => {
      const score = (u) =>
        u.includes('douyinvod.com') || u.includes('zjcdn.com') || u.includes('snssdk.com')
          ? 2
          : u.includes('/aweme/v1/play/')
            ? 1
            : 0
      return score(b) - score(a)
    })
    return merged.slice(0, 8)
  }

  const normalizeAwemeWithUrls = (raw, channelHint) => {
    const item = raw?.aweme_info || raw?.aweme || raw?.cell_info?.aweme || raw?.item || raw
    if (!item || typeof item !== 'object') return null
    const id = String(item.aweme_id || item.awemeId || item.item_id || '').trim()
    if (!id || !/^\d{6,}$/.test(id)) return null
    const authorObj = item.author || item.authorInfo || {}
    const videoObj = item.video || {}
    const stats = item.statistics || item.stats || {}
    const musicObj = item.music || {}
    const rawDuration = Number(videoObj.duration || item.duration || 0)
    const duration = rawDuration > 1000 ? Math.round(rawDuration / 1000) : Math.max(0, Math.round(rawDuration))
    const artwork =
      firstUrl(videoObj.origin_cover) ||
      firstUrl(videoObj.cover) ||
      firstUrl(videoObj.dynamic_cover) ||
      firstUrl(videoObj.coverUrlList) ||
      firstUrl(authorObj.avatar_medium) ||
      firstUrl(authorObj.avatarThumb) ||
      null
    const avatar =
      firstUrl(authorObj.avatar_thumb) ||
      firstUrl(authorObj.avatar_medium) ||
      firstUrl(authorObj.avatarThumb) ||
      toHttps(authorObj.avatarUri) ||
      null
    const musicTitle = musicObj.title
      ? musicObj.author && !musicObj.title.includes(musicObj.author)
        ? `${musicObj.title} - ${musicObj.author}`
        : musicObj.title
      : null

    const video = {
      id,
      title: String(item.desc || item.preview_title || item.title || '抖音精选短视频').trim(),
      author: String(authorObj.nickname || '抖音创作者').trim(),
      avatar,
      artwork,
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
      url: `https://www.douyin.com/video/${id}`,
      liked: Boolean(item.user_digged || item.userDigged),
      collected: Boolean(item.collect_stat || item.collectStat),
      likes: toNonNegInt(stats.digg_count ?? stats.diggCount),
      comments: toNonNegInt(stats.comment_count ?? stats.commentCount),
      collects: toNonNegInt(stats.collect_count ?? stats.collectCount),
      shares: toNonNegInt(stats.share_count ?? stats.shareCount),
      music: musicTitle,
      width: toNonNegInt(videoObj.width),
      height: toNonNegInt(videoObj.height),
      channel: channelHint,
      isLive: Boolean(item.cell_room || item.rawdata),
    }

    return { video, urls: extractPlayUrls(videoObj) }
  }

  const installInterceptors = (onPayload) => {
    try {
      const origFetch = window.fetch
      if (typeof origFetch === 'function') {
        window.fetch = function (...args) {
          const reqUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''
          const p = origFetch.apply(this, args)
          if (
            reqUrl.includes('/aweme/') ||
            reqUrl.includes('/passport/') ||
            reqUrl.includes('/follow/') ||
            reqUrl.includes('/familiar/')
          ) {
            p.then((res) => {
              if (!res || !res.ok) return
              res
                .clone()
                .text()
                .then((txt) => {
                  if (txt && txt.trim().startsWith('{')) onPayload(reqUrl, JSON.parse(txt))
                })
                .catch(() => {})
            }).catch(() => {})
          }
          return p
        }
      }
    } catch {}

    try {
      const origJson = Response.prototype.json
      Response.prototype.json = async function () {
        const data = await origJson.call(this)
        onPayload(this.url || '', data)
        return data
      }
    } catch {}

    try {
      const origOpen = XMLHttpRequest.prototype.open
      const origSend = XMLHttpRequest.prototype.send
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__wpUrl = typeof url === 'string' ? url : String(url || '')
        return origOpen.call(this, method, url, ...rest)
      }
      XMLHttpRequest.prototype.send = function (...args) {
        const reqUrl = this.__wpUrl || ''
        if (
          reqUrl.includes('/aweme/') ||
          reqUrl.includes('/passport/') ||
          reqUrl.includes('feed') ||
          reqUrl.includes('search')
        ) {
          this.addEventListener('load', () => {
            try {
              if (this.status < 200 || this.status >= 300) return
              let parsed = null
              if (this.responseType === 'json') {
                parsed = this.response
              } else if (this.responseType === '' || this.responseType === 'text') {
                if (this.responseText) parsed = JSON.parse(this.responseText)
              } else if (this.responseType === 'arraybuffer' && this.response) {
                const txt = new TextDecoder('utf-8').decode(this.response)
                if (txt && txt.startsWith('{')) parsed = JSON.parse(txt)
              }
              if (parsed) onPayload(reqUrl, parsed)
            } catch {}
          })
        }
        return origSend.apply(this, args)
      }
    } catch {}

    try {
      const origParse = JSON.parse
      JSON.parse = function (...args) {
        const val = origParse.apply(this, args)
        if (
          val &&
          typeof val === 'object' &&
          !Array.isArray(val) &&
          (Array.isArray(val.aweme_list) ||
            Array.isArray(val.feed_list) ||
            Array.isArray(val.cards) ||
            val.aweme_detail ||
            (Array.isArray(val.data) &&
              (val.data[0]?.aweme_info || val.data[0]?.aweme || val.data[0]?.aweme_id || val.data[0]?.cell_info?.aweme)))
        ) {
          onPayload('', val)
        }
        return val
      }
    } catch {}
  }

  const extractListFromPayload = (data) => {
    const out = []
    if (Array.isArray(data.aweme_list) && data.aweme_list.length > 0) out.push(...data.aweme_list)
    if (Array.isArray(data.data?.aweme_list) && data.data.aweme_list.length > 0) out.push(...data.data.aweme_list)
    if (Array.isArray(data.feed_list) && data.feed_list.length > 0) out.push(...data.feed_list)
    if (Array.isArray(data.data) && data.data.length > 0) {
      for (const x of data.data) {
        if (x && (x.aweme_info || x.aweme_id || x.aweme || x.cell_info?.aweme || x.item)) out.push(x)
      }
    }
    if (Array.isArray(data.cards) && data.cards.length > 0) {
      for (const c of data.cards) {
        if (typeof c?.aweme === 'string') {
          try {
            out.push(JSON.parse(c.aweme))
          } catch {}
        } else if (c?.aweme || c?.aweme_info || c?.aweme_id) {
          out.push(c.aweme || c.aweme_info || c)
        }
      }
    }
    if (data.aweme_detail) out.push(data.aweme_detail)
    return out
  }

  // =========================================================================
  // HARVESTER IFRAME MODE: silently fetches channel/search feeds off-screen
  // without ever disturbing or interrupting #wp-douyin-video in window.top!
  // =========================================================================
  if (isHarvester) {
    const bucket = window.name.slice('wp_douyin_loader:'.length) || 'recommend'
    const sentIds = new Set()

    const forwardPayload = (url, data) => {
      if (!data || typeof data !== 'object') return
      const uStr = typeof url === 'string' ? url : ''
      if (uStr.includes('/hot/search') || uStr.includes('/suggest')) return
      const rawList = extractListFromPayload(data)
      if (rawList.length === 0) return

      const videos = []
      const playUrls = {}
      for (const raw of rawList) {
        const res = normalizeAwemeWithUrls(raw, bucket)
        if (!res || sentIds.has(res.video.id)) continue
        sentIds.add(res.video.id)
        videos.push(res.video)
        if (res.urls.length > 0) playUrls[res.video.id] = res.urls
      }
      if (videos.length > 0) {
        try {
          window.top.postMessage(
            { __wpDouyinHarvest: true, bucket, videos, playUrls, isDetail: Boolean(data.aweme_detail) },
            'https://www.douyin.com',
          )
        } catch {}
      }
    }

    installInterceptors(forwardPayload)

    // Keep all videos inside the harvester iframe silent & paused so zero audio leaks.
    const muteAll = () => {
      document.querySelectorAll('video, audio').forEach((m) => {
        try {
          m.muted = true
          if (!m.paused) m.pause()
        } catch {}
      })
    }
    setInterval(muteAll, 400)
    return
  }

  // =========================================================================
  // TOP WINDOW MODE: hosts #wp-douyin-video, CabSound, and coordinates tabs
  // =========================================================================
  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  const diag = (text) => post({ type: 'diag', text })
  const STATE_KEY = 'westplay_douyin_state'

  const readPersisted = () => {
    try {
      const raw = sessionStorage.getItem(STATE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  const saved = readPersisted() || {}

  let wpVideo = null
  let currentMedia = null
  let isPlaying = false
  let wantedPlaying = saved.wantedPlaying !== undefined ? Boolean(saved.wantedPlaying) : true
  let autoScroll = saved.autoScroll !== undefined ? Boolean(saved.autoScroll) : true
  let playbackRate = typeof saved.playbackRate === 'number' ? saved.playbackRate : 1.0
  let isMuted = Boolean(saved.isMuted)
  let targetVolume = typeof saved.targetVolume === 'number' ? saved.targetVolume : 1.0
  let cropOn = Boolean(saved.cropOn)
  let buffering = false
  let hostReady = false
  let lastProgressTime = -1
  let currentChannel = typeof saved.currentChannel === 'string' ? saved.currentChannel : 'recommend'
  let playingChannel = currentChannel
  let activeVideoMeta = saved.activeVideoMeta || null
  let activePlayUrls = []
  let activeUrlIndex = 0
  let activeTriedNoCors = false
  let profile = { nickname: null, avatar: null }
  let lastSignedIn = null
  let lastProfileKey = ''
  let lastDiagAt = 0
  let loaderFrame = null
  let loaderCleanupTimer = null
  let pendingPlayDetailId = null

  if (cropOn) {
    document.documentElement.classList.add('westplay-crop')
  }

  const writePersisted = () => {
    try {
      sessionStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          wantedPlaying,
          autoScroll,
          playbackRate,
          isMuted,
          targetVolume,
          cropOn,
          currentChannel,
          activeVideoMeta,
        }),
      )
    } catch {}
  }

  // Cab 3D speaker system (crates/host/src/cab_sound.js).
  const cab = window.westplayCabSound?.(() => currentMedia, post)
  if (cab) setInterval(() => cab.tick(), 250)
  const cabSeen = { speakers: undefined, equalizer: undefined, spectrum: undefined, outside: undefined, distance: undefined }
  const handleCab = (cmd) => {
    if (!cab) return
    const spkKey = JSON.stringify(cmd.speakers ?? null)
    if (spkKey !== cabSeen.speakers) {
      cabSeen.speakers = spkKey
      cab.speakers(cmd.speakers)
    }
    if (cmd.head) cab.head(cmd.head)
    const outside = Boolean(cmd.outside)
    const distance = Number(cmd.distance) || 0
    if (outside !== cabSeen.outside || distance !== cabSeen.distance) {
      cabSeen.outside = outside
      cabSeen.distance = distance
      cab.outside(outside, distance)
    }
    const eqKey = JSON.stringify(cmd.equalizer ?? null)
    if (eqKey !== cabSeen.equalizer) {
      cabSeen.equalizer = eqKey
      cab.equalizer(cmd.equalizer)
    }
    const spec = Boolean(cmd.spectrum)
    if (spec !== cabSeen.spectrum) {
      cabSeen.spectrum = spec
      cab.spectrum(spec)
    }
  }

  /** Captured videos keyed by channel name (plus 'search' for search results). */
  const feedBuckets = new Map()
  const videoById = new Map()
  /** Direct playable MP4 URLs keyed by aweme_id (kept in-page, not sent over IPC). */
  const playUrlsById = new Map()

  const ensureDirectVideo = () => {
    if (wpVideo && document.body?.contains(wpVideo)) return wpVideo
    if (!document.body) return null
    let el = document.getElementById('wp-douyin-video')
    if (!el) {
      el = document.createElement('video')
      el.id = 'wp-douyin-video'
      el.playsInline = true
      el.preload = 'auto'
      document.body.appendChild(el)
    }
    wpVideo = el
    hookMedia(el)
    return el
  }

  const silencePageVideos = () => {
    document.querySelectorAll('video:not(#wp-douyin-video)').forEach((v) => {
      try {
        if (!v.paused) v.pause()
        v.muted = true
      } catch {}
    })
  }

  const applyMediaSettings = (el) => {
    if (!el) return
    try {
      el.playbackRate = playbackRate
      el.muted = isMuted
      el.volume = targetVolume
      el.loop = !autoScroll
    } catch {}
  }

  const tryPlay = (el) => {
    if (!el) return
    applyMediaSettings(el)
    const p = el.play()
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        try {
          el.muted = true
          el.play()
            .then(() => {
              if (!isMuted) el.muted = false
            })
            .catch(() => {})
        } catch {}
      })
    }
  }

  const loadDirectUrl = (index, useCors = true) => {
    const el = ensureDirectVideo()
    if (!el || index >= activePlayUrls.length) return false
    const url = activePlayUrls[index]
    activeUrlIndex = index
    activeTriedNoCors = !useCors
    buffering = true
    hostReady = false
    lastProgressTime = -1
    silencePageVideos()

    try {
      if (useCors) el.crossOrigin = 'anonymous'
      else el.removeAttribute('crossorigin')
      el.src = url
      el.load()
      if (wantedPlaying) tryPlay(el)
    } catch {}
    sendPlayback(true)
    return true
  }

  const playCapturedVideo = (video, channelOverride) => {
    if (!video || !video.id) return false
    const urls = playUrlsById.get(video.id)
    if (!urls || urls.length === 0) return false
    activeVideoMeta = video
    activePlayUrls = urls
    playingChannel = channelOverride || video.channel || currentChannel
    wantedPlaying = true
    writePersisted()
    diag(`direct play id=${video.id} urls=${urls.length} title=${video.title.slice(0, 24)}`)
    return loadDirectUrl(0, true)
  }

  const hasLoadedVideo = () => Boolean(wpVideo && wpVideo.src)

  const scheduleLoaderCleanup = () => {
    clearTimeout(loaderCleanupTimer)
    loaderCleanupTimer = setTimeout(() => {
      if (loaderFrame) {
        try {
          loaderFrame.src = 'about:blank'
        } catch {}
      }
    }, 9000)
  }

  const loadInBackgroundFrame = (bucket, url) => {
    if (!document.body) {
      setTimeout(() => loadInBackgroundFrame(bucket, url), 200)
      return
    }
    if (loaderFrame && loaderFrame.parentNode) {
      loaderFrame.parentNode.removeChild(loaderFrame)
    }
    const iframe = document.createElement('iframe')
    iframe.id = 'wp-douyin-loader'
    iframe.name = `wp_douyin_loader:${bucket}`
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;width:1280px;height:720px;border:0;opacity:0;pointer-events:none;visibility:hidden;'
    iframe.src = url
    document.body.appendChild(iframe)
    loaderFrame = iframe
    diag(`bg-load bucket=${bucket} url=${url.replace('https://www.douyin.com', '')}`)
    scheduleLoaderCleanup()
  }

  const mergeNormalizedVideos = (bucketKey, normalizedItems, urlsMap = null, isDetail = false) => {
    if (!Array.isArray(normalizedItems) || normalizedItems.length === 0) return 0
    const existing = feedBuckets.get(bucketKey) || []
    const seen = new Set(existing.map((v) => v.id))
    let added = 0
    let playableCount = 0

    for (const v of normalizedItems) {
      if (!v || !v.id) continue
      if (urlsMap && Array.isArray(urlsMap[v.id]) && urlsMap[v.id].length > 0) {
        playUrlsById.set(v.id, urlsMap[v.id])
      }
      videoById.set(v.id, v)
      if (playUrlsById.has(v.id)) playableCount++
      if (!seen.has(v.id)) {
        seen.add(v.id)
        existing.push(v)
        added++
      }
    }
    if (existing.length > 60) existing.splice(0, existing.length - 60)
    feedBuckets.set(bucketKey, existing)

    if (isDetail && pendingPlayDetailId) {
      const target = videoById.get(pendingPlayDetailId)
      if (target && playUrlsById.has(target.id)) {
        pendingPlayDetailId = null
        playCapturedVideo(target, bucketKey)
      }
    }

    if (added > 0) {
      diag(`captured ${added} videos for bucket=${bucketKey} (total=${existing.length}, playable=${playableCount})`)
      if (bucketKey !== 'search') {
        post({
          type: 'answer',
          answer: { id: 0, channel: bucketKey, videos: existing.slice(0, 30) },
        })
      }
      // ONLY auto-start when nothing is loaded yet (cold start). Switching tabs NEVER interrupts active playback!
      if (wantedPlaying && !hasLoadedVideo() && bucketKey !== 'search') {
        const pendingMatch =
          activeVideoMeta?.id && playUrlsById.has(activeVideoMeta.id) ? videoById.get(activeVideoMeta.id) : null
        const firstPlayable = pendingMatch || existing.find((v) => playUrlsById.has(v.id))
        if (firstPlayable) {
          playCapturedVideo(firstPlayable, bucketKey)
        }
      }
    }
    return added
  }

  const inspectApiPayload = (url, data) => {
    if (!data || typeof data !== 'object') return
    try {
      const uStr = typeof url === 'string' ? url : ''
      if ((uStr.includes('/user/profile/self') || data.user?.sec_uid) && data.user) {
        const u = data.user
        if (u.uid || u.sec_uid) {
          profile = {
            nickname: u.nickname || profile.nickname,
            avatar: firstUrl(u.avatar_thumb) || firstUrl(u.avatar_medium) || profile.avatar,
          }
          emitState(true)
        }
      } else if (uStr.includes('/passport/web/account/info') && data.data) {
        const d = data.data
        if (d.user_id_str || d.user_id) {
          profile = {
            nickname: d.screen_name || d.name || profile.nickname,
            avatar: d.avatar_url || profile.avatar,
          }
          emitState(true)
        }
      }

      if (uStr.includes('/hot/search') || uStr.includes('/suggest')) return
      const isSearch = uStr.includes('/search') || location.pathname.startsWith('/search')
      const isFollow = uStr.includes('/follow/') || uStr.includes('/familiar/') || location.pathname.startsWith('/follow')
      const bucket = isSearch ? 'search' : isFollow ? 'follow' : currentChannel

      const rawList = extractListFromPayload(data)
      if (rawList.length === 0) return

      const videos = []
      const urlsMap = {}
      for (const raw of rawList) {
        const res = normalizeAwemeWithUrls(raw, bucket)
        if (!res) continue
        videos.push(res.video)
        if (res.urls.length > 0) urlsMap[res.video.id] = res.urls
      }
      mergeNormalizedVideos(bucket, videos, urlsMap, Boolean(data.aweme_detail))
    } catch {}
  }

  installInterceptors(inspectApiPayload)

  // Inject full-bleed video styles for #wp-douyin-video while hiding Douyin's own chrome and our off-screen loader
  const style = document.createElement('style')
  style.id = 'westplay-douyin-style'
  style.textContent = `
    html, body {
      background: #000 !important;
      overflow: hidden !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
    }
    body > :not(#wp-douyin-video) {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    #wp-douyin-video {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      position: fixed !important;
      inset: 0 !important;
      left: 0 !important;
      top: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: #000 !important;
      object-fit: contain !important;
    }
    html.westplay-crop #wp-douyin-video {
      object-fit: cover !important;
    }
  `

  const addStyle = () => {
    const parent = document.head || document.documentElement
    if (parent) {
      if (!document.getElementById('westplay-douyin-style')) {
        parent.appendChild(style)
      }
    } else {
      requestAnimationFrame(addStyle)
    }
  }
  addStyle()
  document.addEventListener('DOMContentLoaded', () => {
    addStyle()
    ensureDirectVideo()
  })

  const hookMedia = (el) => {
    if (!el || el === currentMedia) return
    currentMedia = el
    applyMediaSettings(el)

    el.addEventListener('loadeddata', () => {
      if (el !== currentMedia) return
      hostReady = el.videoWidth > 0 || el.readyState >= 2
      buffering = false
      applyMediaSettings(el)
      diag(`loadeddata id=${activeVideoMeta?.id || '?'} dim=${el.videoWidth}x${el.videoHeight} dur=${el.duration.toFixed(1)}`)
      sendPlayback(true)
    })
    el.addEventListener('canplay', () => {
      if (el !== currentMedia) return
      hostReady = true
      buffering = false
      if (wantedPlaying && el.paused) tryPlay(el)
      sendPlayback(true)
    })
    el.addEventListener('waiting', () => {
      if (el !== currentMedia) return
      buffering = true
      sendPlayback(true)
    })
    el.addEventListener('playing', () => {
      if (el !== currentMedia) return
      isPlaying = true
      hostReady = true
      buffering = false
      sendPlayback(true)
    })
    el.addEventListener('play', () => {
      if (el !== currentMedia) return
      isPlaying = true
      if (el.readyState >= 2) buffering = false
      sendPlayback(true)
    })
    el.addEventListener('pause', () => {
      if (el !== currentMedia) return
      isPlaying = false
      buffering = false
      sendPlayback(true)
    })
    el.addEventListener('timeupdate', () => {
      if (el !== currentMedia) return
      if (el.currentTime > lastProgressTime || el.readyState >= 3) {
        lastProgressTime = el.currentTime
        buffering = false
        hostReady = true
        isPlaying = !el.paused
      }
      sendPlayback(false)
    })
    el.addEventListener('ended', () => {
      if (el !== currentMedia) return
      isPlaying = false
      buffering = false
      sendPlayback(true)
      if (autoScroll) {
        switchVideo('next')
      } else {
        el.currentTime = 0
        tryPlay(el)
      }
    })
    el.addEventListener('error', () => {
      if (el !== currentMedia) return
      const errCode = el.error?.code
      diag(`video error code=${errCode} idx=${activeUrlIndex}/${activePlayUrls.length} noCors=${activeTriedNoCors}`)
      if (!activeTriedNoCors && activeUrlIndex < activePlayUrls.length) {
        loadDirectUrl(activeUrlIndex, false)
        return
      }
      if (activeUrlIndex + 1 < activePlayUrls.length) {
        loadDirectUrl(activeUrlIndex + 1, true)
        return
      }
      buffering = false
      isPlaying = false
      sendPlayback(true)
    })
  }

  const getPlaybackList = () => {
    const bucket = feedBuckets.get(playingChannel) || feedBuckets.get(currentChannel) || []
    const playable = bucket.filter((v) => playUrlsById.has(v.id))
    if (playable.length > 0) return playable
    return Array.from(videoById.values()).filter((v) => playUrlsById.has(v.id))
  }

  const switchVideo = (direction) => {
    const list = getPlaybackList()
    if (list.length === 0) return
    const curIdx = activeVideoMeta ? list.findIndex((v) => v.id === activeVideoMeta.id) : -1
    const delta = direction === 'next' ? 1 : -1
    const nextIdx = curIdx >= 0 ? (curIdx + delta + list.length) % list.length : 0
    const next = list[nextIdx]
    if (next) {
      playCapturedVideo(next, playingChannel)
      if (direction === 'next' && nextIdx >= list.length - 3) {
        const url = CHANNEL_URLS[playingChannel] || CHANNEL_URLS.recommend
        loadInBackgroundFrame(playingChannel, url)
      }
    }
  }

  const emitState = (signedIn) => {
    const profileKey = `${profile.nickname || ''}|${profile.avatar || ''}`
    if (signedIn === lastSignedIn && profileKey === lastProfileKey) return
    lastSignedIn = signedIn
    lastProfileKey = profileKey
    post({
      type: 'state',
      state: {
        signedIn,
        playing: isPlaying,
        nickname: profile.nickname,
        avatar: profile.avatar,
      },
    })
  }

  const checkStatus = () => {
    const hasCookies =
      document.cookie.includes('sessionid=') ||
      document.cookie.includes('sessionid_ss=') ||
      document.cookie.includes('sid_tt=') ||
      document.cookie.includes('uid_tt=')
    const selfLink = document.querySelector('a[href*="/user/self"], [data-e2e="user-info-self"]')
    const signedIn = Boolean(hasCookies || selfLink || profile.nickname)
    emitState(signedIn)
  }

  const fetchProfileOnce = async () => {
    try {
      const res = await fetch('/aweme/v1/web/user/profile/self/?device_platform=webapp&aid=6383', {
        credentials: 'include',
      })
      if (res.ok) {
        inspectApiPayload('/aweme/v1/web/user/profile/self/', await res.json())
      }
    } catch {}
  }

  let lastPlaybackTime = 0
  const sendPlayback = (force = false) => {
    const now = performance.now()
    if (!force && now - lastPlaybackTime < 250 && isPlaying) return
    lastPlaybackTime = now

    const meta = activeVideoMeta
    if (!meta) return

    const el = currentMedia
    const duration = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : meta.duration || 0
    const position = el && Number.isFinite(el.currentTime) ? el.currentTime : 0
    const isVertical =
      el && el.videoWidth > 0
        ? el.videoHeight > el.videoWidth
        : meta.width && meta.height
          ? meta.height > meta.width
          : undefined

    post({
      type: 'playback',
      playback: {
        id: meta.id,
        title: meta.title,
        artist: meta.author,
        author: meta.author,
        avatar: meta.avatar ?? null,
        artwork: meta.artwork ?? null,
        duration,
        position,
        status: isPlaying ? 'playing' : 'paused',
        liked: Boolean(meta.liked),
        collected: Boolean(meta.collected),
        likes: meta.likes,
        comments: meta.comments,
        music: meta.music ?? null,
        rate: playbackRate,
        muted: isMuted,
        autoScroll,
        buffering,
        hostReady,
        isVertical,
        channel: playingChannel,
      },
    })
  }

  const waitForBucket = (bucketKey, timeoutMs = 5500) =>
    new Promise((resolve) => {
      const start = Date.now()
      const poll = () => {
        const captured = feedBuckets.get(bucketKey)
        if (captured && captured.length > 0) {
          resolve(captured.slice(0, 30))
          return
        }
        if (Date.now() - start >= timeoutMs) {
          resolve([])
          return
        }
        setTimeout(poll, 300)
      }
      poll()
    })

  const handleHost = async (cmd) => {
    if (!cmd || typeof cmd !== 'object') return
    const { action } = cmd

    if (action === 'cab') {
      handleCab(cmd)
      return
    }

    if (action === 'start') {
      wantedPlaying = true
      writePersisted()
      ensureDirectVideo()
      checkStatus()
      fetchProfileOnce()
      const list = getPlaybackList()
      if (wpVideo && wpVideo.src && wpVideo.paused) {
        tryPlay(wpVideo)
      } else if ((!wpVideo || !wpVideo.src) && list.length > 0) {
        playCapturedVideo(list[0], currentChannel)
      }
      sendPlayback(true)
    } else if (action === 'crop') {
      cropOn = Boolean(cmd.on)
      document.documentElement.classList.toggle('westplay-crop', cropOn)
      writePersisted()
    } else if (action === 'play') {
      wantedPlaying = true
      if (cmd.video && cmd.video.id) {
        const targetId = String(cmd.video.id)
        const cached = videoById.get(targetId) || cmd.video
        if (playCapturedVideo(cached, currentChannel)) {
          return
        }
        // Load detail page silently in harvester iframe so playback continues until the target stream is ready
        if (/^\d{6,}$/.test(targetId)) {
          pendingPlayDetailId = targetId
          loadInBackgroundFrame(currentChannel, cached.url || `https://www.douyin.com/video/${targetId}`)
          return
        }
      }
      writePersisted()
      const el = ensureDirectVideo()
      if (el && el.src) {
        tryPlay(el)
      } else {
        const list = getPlaybackList()
        if (list.length > 0) playCapturedVideo(list[0], currentChannel)
      }
    } else if (action === 'pause') {
      wantedPlaying = false
      writePersisted()
      if (currentMedia) currentMedia.pause()
      silencePageVideos()
      sendPlayback(true)
    } else if (action === 'toggle') {
      if (isPlaying) handleHost({ action: 'pause' })
      else handleHost({ action: 'play' })
    } else if (action === 'next') {
      wantedPlaying = true
      writePersisted()
      switchVideo('next')
    } else if (action === 'previous') {
      wantedPlaying = true
      writePersisted()
      switchVideo('previous')
    } else if (action === 'seek') {
      if (currentMedia && typeof cmd.seconds === 'number' && Number.isFinite(cmd.seconds)) {
        currentMedia.currentTime = Math.max(0, cmd.seconds)
        sendPlayback(true)
      }
    } else if (action === 'volume') {
      if (typeof cmd.percent === 'number' && Number.isFinite(cmd.percent)) {
        targetVolume = Math.max(0, Math.min(1, cmd.percent / 100))
        writePersisted()
        if (currentMedia) currentMedia.volume = targetVolume
      }
    } else if (action === 'mute') {
      isMuted = Boolean(cmd.muted)
      writePersisted()
      if (currentMedia) currentMedia.muted = isMuted
      sendPlayback(true)
    } else if (action === 'rate') {
      if (typeof cmd.rate === 'number' && cmd.rate >= 0.5 && cmd.rate <= 3.0) {
        playbackRate = cmd.rate
        writePersisted()
        if (currentMedia) currentMedia.playbackRate = playbackRate
        sendPlayback(true)
      }
    } else if (action === 'autoScroll') {
      autoScroll = Boolean(cmd.on)
      writePersisted()
      if (currentMedia) currentMedia.loop = !autoScroll
      sendPlayback(true)
    } else if (action === 'channel') {
      const next = String(cmd.channel || 'recommend')
      currentChannel = next
      writePersisted()
      const existing = feedBuckets.get(next)
      if (existing && existing.length > 0) {
        post({ type: 'answer', answer: { id: 0, channel: next, videos: existing.slice(0, 30) } })
      } else {
        const url = CHANNEL_URLS[next] || CHANNEL_URLS.recommend
        loadInBackgroundFrame(next, url)
      }
    } else if (action === 'refresh') {
      // Refresh only the currently viewed tab's feed list in background; never interrupt active video!
      feedBuckets.delete(currentChannel)
      const url = CHANNEL_URLS[currentChannel] || CHANNEL_URLS.recommend
      loadInBackgroundFrame(currentChannel, url)
    } else if (action === 'like') {
      if (activeVideoMeta) {
        activeVideoMeta = { ...activeVideoMeta, liked: !activeVideoMeta.liked }
        const nativeActive = document.querySelector(`[data-e2e="feed-active-video"][data-e2e-vid="${activeVideoMeta.id}"]`)
        const isDetailPage = location.pathname.includes(`/video/${activeVideoMeta.id}`)
        const scope = nativeActive || (isDetailPage ? document : null)
        const likeBtn = scope?.querySelector?.('[data-e2e="video-player-digg"], [data-e2e="feed-like-icon"]')
        if (likeBtn && typeof likeBtn.click === 'function') {
          try {
            likeBtn.click()
          } catch {}
        }
        sendPlayback(true)
      }
    } else if (action === 'collect') {
      if (activeVideoMeta) {
        activeVideoMeta = { ...activeVideoMeta, collected: !activeVideoMeta.collected }
        const nativeActive = document.querySelector(`[data-e2e="feed-active-video"][data-e2e-vid="${activeVideoMeta.id}"]`)
        const isDetailPage = location.pathname.includes(`/video/${activeVideoMeta.id}`)
        const scope = nativeActive || (isDetailPage ? document : null)
        const collectBtn = scope?.querySelector?.('[data-e2e="video-player-collect"], [data-e2e="feed-collect-icon"]')
        if (collectBtn && typeof collectBtn.click === 'function') {
          try {
            collectBtn.click()
          } catch {}
        }
        sendPlayback(true)
      }
    } else if (action === 'ask') {
      handleAsk(cmd.id, cmd.question)
    }
  }

  const handleAsk = async (id, question) => {
    try {
      if (question?.ask === 'feed') {
        const ch = question.channel || currentChannel
        currentChannel = ch
        const existing = feedBuckets.get(ch)
        if (existing && existing.length > 0) {
          post({ type: 'answer', answer: { id, channel: ch, videos: existing.slice(0, 30) } })
          return
        }
        const videos = await waitForBucket(ch, 5500)
        post({ type: 'answer', answer: { id, channel: ch, videos } })
      } else if (question?.ask === 'search') {
        const query = String(question.query || '').trim()
        if (!query) {
          post({ type: 'answer', answer: { id, videos: [] } })
          return
        }
        feedBuckets.delete('search')
        const targetUrl = `https://www.douyin.com/search/${encodeURIComponent(query)}?type=video`
        loadInBackgroundFrame('search', targetUrl)
        const videos = await waitForBucket('search', 6000)
        post({ type: 'answer', answer: { id, videos } })
      } else if (question?.ask === 'profile') {
        await fetchProfileOnce()
        post({ type: 'answer', answer: { id, videos: [] } })
      }
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err) } })
    }
  }

  setInterval(() => {
    silencePageVideos()
    checkStatus()
    const el = ensureDirectVideo()
    if (el && wantedPlaying && !el.src) {
      const list = getPlaybackList()
      if (list.length > 0) playCapturedVideo(list[0], currentChannel)
    }
    const now = Date.now()
    if (now - lastDiagAt > 8000) {
      lastDiagAt = now
      const vInfo = el
        ? `ready=${el.readyState} dim=${el.videoWidth}x${el.videoHeight} paused=${el.paused} t=${el.currentTime.toFixed(1)}/${Number.isFinite(el.duration) ? el.duration.toFixed(1) : 'NaN'}`
        : 'none'
      diag(`tab=${currentChannel} playTab=${playingChannel} wp=(${vInfo}) cached=${videoById.size} playable=${playUrlsById.size}`)
    }
  }, 1000)

  window.westplayDouyinCommand = (cmd) => handleHost(cmd)

  const handleMessage = (data) => {
    try {
      const cmd = typeof data === 'string' ? JSON.parse(data) : data
      handleHost(cmd)
    } catch (e) {
      console.error('[douyin] handleMessage error', e)
    }
  }

  window.chrome?.webview?.addEventListener('message', (event) => handleMessage(event.data))
  window.addEventListener('message', (event) => {
    if (event.origin === location.origin && event.data && event.data.__wpDouyinHarvest) {
      const { bucket, videos, playUrls, isDetail } = event.data
      mergeNormalizedVideos(bucket, videos, playUrls, Boolean(isDetail))
      scheduleLoaderCleanup()
      return
    }
    handleMessage(event.data)
  })
  window.chrome?.webview?.postMessage({ ready: true })

  checkStatus()
  setTimeout(fetchProfileOnce, 1000)
})()
