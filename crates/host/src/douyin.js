// WestPlay: Douyin short video controller (crates/host/src/douyin.rs).
// Runs in the hidden WebView2 hosting https://www.douyin.com/
;(() => {
  if (!location.hostname.includes('douyin.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)

  const CHANNEL_URLS = {
    recommend: 'https://www.douyin.com/?recommend=1',
    jingxuan: 'https://www.douyin.com/jingxuan',
    follow: 'https://www.douyin.com/follow',
    hot: 'https://www.douyin.com/hot',
    knowledge: 'https://www.douyin.com/channel/300203',
    music: 'https://www.douyin.com/channel/300209',
    car: 'https://www.douyin.com/channel/300222',
    travel: 'https://www.douyin.com/channel/300221',
    food: 'https://www.douyin.com/channel/300204',
    game: 'https://www.douyin.com/channel/300205',
    entertainment: 'https://www.douyin.com/channel/300201',
    sports: 'https://www.douyin.com/channel/300207',
  }

  let sound = null
  let currentMedia = null
  let isPlaying = false
  let wantedPlaying = false
  let autoScroll = true
  let playbackRate = 1.0
  let isMuted = false
  let targetVolume = 1.0
  let buffering = false
  let hostReady = false
  let currentChannel = 'recommend'
  let activeVideoMeta = null
  let profile = { nickname: null, avatar: null }
  let lastSignedIn = null
  let lastProfileKey = ''

  /** Captured videos keyed by channel name (plus 'search' for search results). */
  const feedBuckets = new Map()
  const videoById = new Map()

  const firstUrl = (obj) => {
    if (!obj) return null
    if (typeof obj === 'string') return obj
    const list = obj.url_list || obj.urlList
    if (Array.isArray(list)) {
      return list.find((u) => typeof u === 'string' && /^https?:\/\//.test(u)) || null
    }
    return null
  }

  const normalizeAweme = (raw, channelHint) => {
    const item = raw?.aweme_info || raw?.aweme || raw
    if (!item || typeof item !== 'object') return null
    const id = String(item.aweme_id || item.awemeId || item.id || '').trim()
    if (!id) return null
    const authorObj = item.author || {}
    const videoObj = item.video || {}
    const stats = item.statistics || {}
    const musicObj = item.music || {}
    const rawDuration = Number(videoObj.duration || item.duration || 0)
    const duration = rawDuration > 1000 ? Math.round(rawDuration / 1000) : Math.round(rawDuration)
    const artwork =
      firstUrl(videoObj.origin_cover) ||
      firstUrl(videoObj.cover) ||
      firstUrl(videoObj.dynamic_cover) ||
      firstUrl(authorObj.avatar_medium) ||
      null
    const avatar = firstUrl(authorObj.avatar_thumb) || firstUrl(authorObj.avatar_medium) || null
    const musicTitle = musicObj.title
      ? musicObj.author && !musicObj.title.includes(musicObj.author)
        ? `${musicObj.title} - ${musicObj.author}`
        : musicObj.title
      : null

    return {
      id,
      title: (item.desc || item.preview_title || '抖音精选短视频').trim(),
      author: (authorObj.nickname || '抖音创作者').trim(),
      avatar,
      artwork,
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
      url: `https://www.douyin.com/video/${id}`,
      liked: Boolean(item.user_digged),
      collected: Boolean(item.collect_stat),
      likes: Number(stats.digg_count || 0) || undefined,
      comments: Number(stats.comment_count || 0) || undefined,
      collects: Number(stats.collect_count || 0) || undefined,
      shares: Number(stats.share_count || 0) || undefined,
      music: musicTitle,
      width: Number(videoObj.width || 0) || undefined,
      height: Number(videoObj.height || 0) || undefined,
      channel: channelHint || currentChannel,
      isLive: Boolean(item.cell_room || item.rawdata),
    }
  }

  const recordVideos = (bucketKey, list) => {
    if (!Array.isArray(list) || list.length === 0) return
    const existing = feedBuckets.get(bucketKey) || []
    const seen = new Set(existing.map((v) => v.id))
    let added = false
    for (const raw of list) {
      const normalized = normalizeAweme(raw, bucketKey)
      if (!normalized) continue
      videoById.set(normalized.id, normalized)
      if (!seen.has(normalized.id)) {
        seen.add(normalized.id)
        existing.push(normalized)
        added = true
      }
    }
    if (existing.length > 60) existing.splice(0, existing.length - 60)
    feedBuckets.set(bucketKey, existing)
    if (added && bucketKey !== 'search') {
      post({
        type: 'answer',
        answer: { id: 0, channel: bucketKey, videos: existing.slice(0, 30) },
      })
    }
  }

  const inspectApiPayload = (url, data) => {
    if (!data || typeof data !== 'object') return
    try {
      if (url.includes('/user/profile/self') && data.user) {
        const u = data.user
        if (u.uid || u.sec_uid) {
          profile = {
            nickname: u.nickname || profile.nickname,
            avatar: firstUrl(u.avatar_thumb) || firstUrl(u.avatar_medium) || profile.avatar,
          }
          emitState(true)
        }
      } else if (url.includes('/passport/web/account/info') && data.data) {
        const d = data.data
        if (d.user_id_str || d.user_id) {
          profile = {
            nickname: d.screen_name || d.name || profile.nickname,
            avatar: d.avatar_url || profile.avatar,
          }
          emitState(true)
        }
      }

      if (url.includes('/aweme/v1/web/general/search') || url.includes('/aweme/v1/web/search/item')) {
        const items = Array.isArray(data.data) ? data.data : Array.isArray(data.aweme_list) ? data.aweme_list : []
        recordVideos('search', items)
      } else if (
        url.includes('/aweme/v1/web/tab/feed') ||
        url.includes('/aweme/v1/web/channel/feed') ||
        url.includes('/aweme/v1/web/follow/feed') ||
        url.includes('/aweme/v1/web/module/feed') ||
        url.includes('/aweme/v1/web/aweme/post') ||
        url.includes('/aweme/v1/web/aweme/related')
      ) {
        const list = Array.isArray(data.aweme_list)
          ? data.aweme_list
          : Array.isArray(data.data?.aweme_list)
            ? data.data.aweme_list
            : []
        const bucket = url.includes('/follow/feed') ? 'follow' : currentChannel
        recordVideos(bucket, list)
      } else if (url.includes('/aweme/v1/web/aweme/detail') && data.aweme_detail) {
        const v = normalizeAweme(data.aweme_detail, currentChannel)
        if (v) {
          videoById.set(v.id, v)
          activeVideoMeta = v
          sendPlayback(true)
        }
      }
    } catch {}
  }

  // Passively hook fetch & XHR at document_start to capture Douyin's own signed API responses
  try {
    const origFetch = window.fetch
    if (typeof origFetch === 'function') {
      window.fetch = function (...args) {
        const reqUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''
        const promise = origFetch.apply(this, args)
        if (reqUrl.includes('/aweme/v1/web/') || reqUrl.includes('/passport/web/account/info')) {
          promise
            .then((res) => {
              if (!res || !res.ok) return
              res
                .clone()
                .json()
                .then((json) => inspectApiPayload(reqUrl, json))
                .catch(() => {})
            })
            .catch(() => {})
        }
        return promise
      }
    }
  } catch {}

  try {
    const origOpen = XMLHttpRequest.prototype.open
    const origSend = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__wpUrl = typeof url === 'string' ? url : ''
      return origOpen.call(this, method, url, ...rest)
    }
    XMLHttpRequest.prototype.send = function (...args) {
      const reqUrl = this.__wpUrl || ''
      if (reqUrl.includes('/aweme/v1/web/') || reqUrl.includes('/passport/web/account/info')) {
        this.addEventListener('load', () => {
          try {
            if (this.status >= 200 && this.status < 300 && this.responseText) {
              inspectApiPayload(reqUrl, JSON.parse(this.responseText))
            }
          } catch {}
        })
      }
      return origSend.apply(this, args)
    }
  } catch {}

  // Inject full-bleed video styles and strip all site chrome
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
    body * {
      visibility: hidden !important;
    }
    video.westplay-active-video,
    [data-e2e="feed-active-video"] video {
      visibility: visible !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      left: 0 !important;
      top: 0 !important;
      z-index: 2147483647 !important;
      background: #000 !important;
      object-fit: contain !important;
      transform: none !important;
    }
    html.westplay-crop video.westplay-active-video,
    html.westplay-crop [data-e2e="feed-active-video"] video {
      object-fit: cover !important;
    }
    .semi-modal,
    .semi-modal-wrap,
    .semi-portal,
    .login-mask,
    [class*="login-guide"],
    [class*="loginMask"],
    .dy-account-close {
      display: none !important;
      visibility: hidden !important;
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

  const dismissLoginGuides = () => {
    // Only dismiss non-captcha login nags; never touch verification/captcha containers.
    const closeBtns = document.querySelectorAll(
      '[class*="login-guide"] [class*="close"], .dy-account-close, [data-e2e="login-close"]',
    )
    closeBtns.forEach((btn) => {
      try {
        if (btn && typeof btn.click === 'function') btn.click()
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

  const markActiveVideo = (el) => {
    document.querySelectorAll('video.westplay-active-video').forEach((v) => {
      if (v !== el) v.classList.remove('westplay-active-video')
    })
    if (el) el.classList.add('westplay-active-video')
  }

  const hookMedia = (el) => {
    if (!el) return
    markActiveVideo(el)
    if (el === currentMedia) {
      applyMediaSettings(el)
      return
    }
    currentMedia = el
    hostReady = el.readyState >= 2 && el.videoWidth > 0
    buffering = el.readyState < 3 && !el.paused
    applyMediaSettings(el)

    if (window.westplayCabSound) {
      sound = window.westplayCabSound(el, (bars) => {
        post({ type: 'spectrum', bars })
      })
    }

    el.addEventListener('loadeddata', () => {
      if (el !== currentMedia) return
      hostReady = el.videoWidth > 0
      buffering = false
      applyMediaSettings(el)
      sendPlayback(true)
    })
    el.addEventListener('canplay', () => {
      if (el !== currentMedia) return
      hostReady = el.videoWidth > 0 || el.readyState >= 2
      buffering = false
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
      if (!hostReady && el.videoWidth > 0) hostReady = true
      sendPlayback(false)
    })
    el.addEventListener('ended', () => {
      if (el !== currentMedia) return
      isPlaying = false
      sendPlayback(true)
      if (autoScroll) {
        switchVideo('next')
      } else {
        el.currentTime = 0
        el.play().catch(() => {})
      }
    })
  }

  const findActiveVideo = () => {
    const activeFeed = document.querySelector('[data-e2e="feed-active-video"]')
    if (activeFeed) {
      const v = activeFeed.querySelector('video')
      if (v) return v
    }
    const all = Array.from(document.querySelectorAll('video'))
    const playing = all.find((v) => !v.paused && v.readyState >= 2)
    if (playing) return playing
    const ready = all.find((v) => v.readyState >= 2 && v.videoWidth > 0)
    if (ready) return ready
    return all[0] || null
  }

  const ensurePlaying = () => {
    const v = findActiveVideo()
    if (v) hookMedia(v)
    if (!wantedPlaying) return
    if (v && v.paused) {
      v.play().catch(() => {})
    }
    const playBtn = document.querySelector(
      '[data-e2e="feed-active-video"] .xgplayer-play, .xgplayer-start, .xgplayer-icon-play',
    )
    if (v && v.paused && playBtn && typeof playBtn.click === 'function') {
      try {
        playBtn.click()
      } catch {}
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

  const parseCountText = (text) => {
    if (!text) return undefined
    const cleaned = text.trim()
    const match = cleaned.match(/^([\d.]+)\s*([万wW亿])?/)
    if (!match) return undefined
    const num = Number(match[1])
    if (!Number.isFinite(num)) return undefined
    if (match[2] === '亿') return Math.round(num * 1e8)
    if (match[2] === '万' || match[2] === 'w' || match[2] === 'W') return Math.round(num * 1e4)
    return Math.round(num)
  }

  const extractActiveInfo = () => {
    const urlMatch = location.pathname.match(/\/video\/(\d+)/)
    const activeFeed = document.querySelector('[data-e2e="feed-active-video"]') || document
    const feedAwemeId =
      urlMatch?.[1] ||
      activeFeed.getAttribute?.('data-e2e-vid') ||
      activeFeed.querySelector?.('[data-e2e-vid]')?.getAttribute('data-e2e-vid') ||
      null

    const titleEl = activeFeed.querySelector(
      '[data-e2e="video-desc"], [data-e2e="detail-video-info"] h1, .title, .desc, span[class*="desc"]',
    )
    const authorEl = activeFeed.querySelector(
      '[data-e2e="feed-video-nickname"], [data-e2e="video-author-name"], .account-name, .author, .nickname',
    )
    const avatarEl = activeFeed.querySelector(
      '[data-e2e="video-author-avatar"] img, [data-e2e="user-avatar"] img, img[class*="avatar"]',
    )
    const likeCountEl = activeFeed.querySelector('[data-e2e="video-player-digg"] [data-e2e="digg-count"], [data-e2e="feed-like-count"]')
    const commentCountEl = activeFeed.querySelector('[data-e2e="feed-comment-icon"] + span, [data-e2e="video-player-comment"]')
    const likeIcon = activeFeed.querySelector('[data-e2e="video-player-digg"], [data-e2e="feed-like-icon"]')
    const collectIcon = activeFeed.querySelector('[data-e2e="video-player-collect"], [data-e2e="feed-collect-icon"]')

    const domTitle = titleEl?.textContent?.trim() || ''
    const domAuthor = authorEl?.textContent?.trim()?.replace(/^@/, '') || ''

    let cached = (feedAwemeId && videoById.get(feedAwemeId)) || null
    if (!cached && domTitle) {
      for (const v of videoById.values()) {
        if (v.title && (v.title === domTitle || domTitle.startsWith(v.title.slice(0, 16)))) {
          cached = v
          break
        }
      }
    }
    if (!cached && activeVideoMeta) cached = activeVideoMeta

    const liked =
      likeIcon?.getAttribute?.('data-e2e-state') === 'video-player-is-digged' ||
      likeIcon?.classList?.contains('active') ||
      cached?.liked ||
      false
    const collected =
      collectIcon?.getAttribute?.('data-e2e-state') === 'video-player-is-collected' ||
      collectIcon?.classList?.contains('active') ||
      cached?.collected ||
      false

    return {
      id: cached?.id || feedAwemeId || 'dy_current',
      title: domTitle || cached?.title || '抖音精选短视频',
      author: domAuthor || cached?.author || '抖音创作者',
      avatar: avatarEl?.src || cached?.avatar || null,
      artwork: cached?.artwork || avatarEl?.src || null,
      liked,
      collected,
      likes: cached?.likes ?? parseCountText(likeCountEl?.textContent),
      comments: cached?.comments ?? parseCountText(commentCountEl?.textContent),
      music: cached?.music || null,
    }
  }

  let lastPlaybackTime = 0
  const sendPlayback = (force = false) => {
    const now = performance.now()
    if (!force && now - lastPlaybackTime < 250 && isPlaying) return
    lastPlaybackTime = now

    const meta = extractActiveInfo()
    const duration = currentMedia && Number.isFinite(currentMedia.duration) ? currentMedia.duration : 0
    const position = currentMedia && Number.isFinite(currentMedia.currentTime) ? currentMedia.currentTime : 0
    const isVertical = currentMedia
      ? currentMedia.videoHeight > currentMedia.videoWidth
      : undefined

    post({
      type: 'playback',
      playback: {
        id: meta.id,
        title: meta.title,
        artist: meta.author,
        author: meta.author,
        avatar: meta.avatar,
        artwork: meta.artwork,
        duration,
        position,
        status: isPlaying ? 'playing' : 'paused',
        liked: meta.liked,
        collected: meta.collected,
        likes: meta.likes,
        comments: meta.comments,
        music: meta.music,
        rate: playbackRate,
        muted: isMuted,
        autoScroll,
        buffering,
        hostReady,
        isVertical,
        channel: currentChannel,
      },
    })
  }

  const switchVideo = (direction) => {
    const isNext = direction === 'next'
    const key = isNext ? 'ArrowDown' : 'ArrowUp'
    const keyCode = isNext ? 40 : 38

    const eventInit = { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true }
    window.dispatchEvent(new KeyboardEvent('keydown', eventInit))
    document.body?.dispatchEvent(new KeyboardEvent('keydown', eventInit))

    const arrowBtn = document.querySelector(
      isNext
        ? '[data-e2e="video-switch-next-arrow"], [data-e2e="feed-arrow-down"], .xgplayer-page-down'
        : '[data-e2e="video-switch-prev-arrow"], [data-e2e="feed-arrow-up"], .xgplayer-page-up',
    )
    if (arrowBtn && typeof arrowBtn.click === 'function') {
      try {
        arrowBtn.click()
      } catch {}
    }

    setTimeout(() => {
      const activeVideo = findActiveVideo()
      if (activeVideo) {
        hookMedia(activeVideo)
        if (wantedPlaying) activeVideo.play().catch(() => {})
      }
      sendPlayback(true)
    }, 380)
  }

  const scrapeDomVideos = (channelHint) => {
    const cards = Array.from(
      document.querySelectorAll(
        '[data-e2e="scroll-list"] li, [data-e2e="search-card-video"], [data-e2e="feed-active-video"], a[href*="/video/"]',
      ),
    )
    const out = []
    const seen = new Set()
    for (const card of cards) {
      const link = card.matches?.('a[href*="/video/"]') ? card : card.querySelector?.('a[href*="/video/"]')
      const href = link?.getAttribute?.('href') || ''
      const idMatch = href.match(/\/video\/(\d+)/)
      const id = idMatch?.[1] || card.getAttribute?.('data-e2e-vid') || ''
      if (!id || seen.has(id)) continue
      seen.add(id)
      const title =
        card.querySelector?.('[data-e2e="video-desc"], p, h3, .title, .desc')?.textContent?.trim() ||
        card.getAttribute?.('title') ||
        ''
      const author =
        card.querySelector?.('[data-e2e="video-author-name"], .author, .nickname')?.textContent?.trim()?.replace(/^@/, '') ||
        '抖音创作者'
      const artwork = card.querySelector?.('img')?.src || null
      if (!title && !artwork) continue
      out.push({
        id,
        title: title || '抖音精选短视频',
        author,
        artwork,
        duration: 0,
        url: `https://www.douyin.com/video/${id}`,
        channel: channelHint,
      })
      if (out.length >= 24) break
    }
    return out
  }

  const waitForBucket = (bucketKey, timeoutMs = 4500) =>
    new Promise((resolve) => {
      const start = Date.now()
      const poll = () => {
        const captured = feedBuckets.get(bucketKey)
        if (captured && captured.length > 0) {
          resolve(captured.slice(0, 30))
          return
        }
        const scraped = scrapeDomVideos(bucketKey)
        if (scraped.length > 0) {
          resolve(scraped)
          return
        }
        if (Date.now() - start >= timeoutMs) {
          resolve([])
          return
        }
        setTimeout(poll, 350)
      }
      poll()
    })

  const handleHost = async (cmd) => {
    if (!cmd || typeof cmd !== 'object') return
    const { action } = cmd

    if (action === 'start') {
      checkStatus()
      fetchProfileOnce()
      const v = findActiveVideo()
      if (v) hookMedia(v)
      sendPlayback(true)
    } else if (action === 'crop') {
      document.documentElement.classList.toggle('westplay-crop', Boolean(cmd.on))
    } else if (action === 'play') {
      wantedPlaying = true
      if (cmd.video && cmd.video.id) {
        activeVideoMeta = cmd.video
        const targetId = String(cmd.video.id)
        const currentInfo = extractActiveInfo()
        if (currentInfo.id !== targetId && /^\d+$/.test(targetId)) {
          const targetUrl = cmd.video.url || `https://www.douyin.com/video/${targetId}`
          if (!location.href.includes(targetId)) {
            location.href = targetUrl
            return
          }
        }
      }
      const activeVideo = findActiveVideo()
      if (activeVideo) {
        hookMedia(activeVideo)
        activeVideo.play().catch(() => {})
      }
    } else if (action === 'pause') {
      wantedPlaying = false
      if (currentMedia) currentMedia.pause()
      const pauseBtn = document.querySelector('[data-e2e="feed-active-video"] .xgplayer-pause, .xgplayer-pause')
      if (pauseBtn && typeof pauseBtn.click === 'function') {
        try {
          pauseBtn.click()
        } catch {}
      }
    } else if (action === 'toggle') {
      if (isPlaying) handleHost({ action: 'pause' })
      else handleHost({ action: 'play' })
    } else if (action === 'next') {
      wantedPlaying = true
      switchVideo('next')
    } else if (action === 'previous') {
      wantedPlaying = true
      switchVideo('previous')
    } else if (action === 'seek') {
      if (currentMedia && typeof cmd.seconds === 'number' && Number.isFinite(cmd.seconds)) {
        currentMedia.currentTime = Math.max(0, cmd.seconds)
        sendPlayback(true)
      }
    } else if (action === 'volume') {
      if (typeof cmd.percent === 'number' && Number.isFinite(cmd.percent)) {
        targetVolume = Math.max(0, Math.min(1, cmd.percent / 100))
        if (currentMedia) currentMedia.volume = targetVolume
      }
    } else if (action === 'mute') {
      isMuted = Boolean(cmd.muted)
      if (currentMedia) currentMedia.muted = isMuted
      sendPlayback(true)
    } else if (action === 'rate') {
      if (typeof cmd.rate === 'number' && cmd.rate >= 0.5 && cmd.rate <= 3.0) {
        playbackRate = cmd.rate
        if (currentMedia) currentMedia.playbackRate = playbackRate
        sendPlayback(true)
      }
    } else if (action === 'autoScroll') {
      autoScroll = Boolean(cmd.on)
      if (currentMedia) currentMedia.loop = !autoScroll
      sendPlayback(true)
    } else if (action === 'channel') {
      const next = String(cmd.channel || 'recommend')
      currentChannel = next
      const url = CHANNEL_URLS[next] || CHANNEL_URLS.recommend
      if (location.href !== url) {
        location.href = url
      }
    } else if (action === 'refresh') {
      feedBuckets.delete(currentChannel)
      location.reload()
    } else if (action === 'like') {
      const likeBtn = document.querySelector(
        '[data-e2e="feed-active-video"] [data-e2e="video-player-digg"], [data-e2e="feed-active-video"] [data-e2e="feed-like-icon"], [data-e2e="video-player-digg"]',
      )
      if (likeBtn && typeof likeBtn.click === 'function') {
        likeBtn.click()
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', keyCode: 90, which: 90, bubbles: true }))
      }
      setTimeout(() => sendPlayback(true), 250)
    } else if (action === 'collect') {
      const collectBtn = document.querySelector(
        '[data-e2e="feed-active-video"] [data-e2e="video-player-collect"], [data-e2e="video-player-collect"]',
      )
      if (collectBtn && typeof collectBtn.click === 'function') {
        collectBtn.click()
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', keyCode: 67, which: 67, bubbles: true }))
      }
      setTimeout(() => sendPlayback(true), 250)
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
        const videos = await waitForBucket(ch, 3500)
        post({ type: 'answer', answer: { id, channel: ch, videos } })
      } else if (question?.ask === 'search') {
        const query = String(question.query || '').trim()
        if (!query) {
          post({ type: 'answer', answer: { id, videos: [] } })
          return
        }
        feedBuckets.delete('search')
        const targetUrl = `https://www.douyin.com/search/${encodeURIComponent(query)}?type=video`
        if (!location.href.includes(encodeURIComponent(query))) {
          location.href = targetUrl
        }
        const videos = await waitForBucket('search', 5500)
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
    dismissLoginGuides()
    ensurePlaying()
    checkStatus()
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
  window.addEventListener('message', (event) => handleMessage(event.data))
  window.chrome?.webview?.postMessage({ ready: true })

  checkStatus()
  setTimeout(fetchProfileOnce, 1200)
})()
