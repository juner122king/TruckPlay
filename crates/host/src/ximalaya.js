// WestPlay: Ximalaya player controller (crates/host/src/ximalaya.rs).
// Runs in the hidden WebView2 hosting https://www.ximalaya.com/
;(() => {
  if (!location.hostname.includes('ximalaya.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  let sound = null
  let currentAudio = null
  let currentTrack = null
  let isPlaying = false
  let playAttemptSeq = 0
  let hls = null
  const PlayerHls = window.Hls
  let controller = null
  let retryTimer = null
  let watchdog = null
  let stableTimer = null
  let waitingTimer = null
  let retries = 0
  let unexpectedPauses = 0
  let lastUnexpectedPauseAt = 0
  let wanted = false
  let status = 'paused'
  let error = null
  let requestId = null
  let volume = 1
  let speed = 1
  let cab = null
  const RADIO_RETRY_DELAYS = [2000, 4000, 8000, 15000, 30000]
  const STABLE_PLAYBACK_MS = 10000
  const PAUSE_BURST_WINDOW_MS = 5000
  const MAX_UNEXPECTED_PAUSES = 2
  const WAITING_DEBOUNCE_MS = 250
  const finite = (value) => (Number.isFinite(value) ? value : 0)
  const radioRoot = 'https://mobile.ximalaya.com/radio-first-page-app'
  const radioJson = async (path, signal) => {
    const response = await fetch(radioRoot + path, { signal: signal || AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error('Radio HTTP ' + response.status)
    const payload = await response.json()
    if (payload.ret !== 0 && payload.ret !== '0000') throw new Error(payload.msg || 'Radio request failed')
    return payload.data ?? payload.result
  }
  const cabSeen = {
    speakers: undefined,
    head: undefined,
    outside: undefined,
    equalizer: undefined,
    spectrum: undefined,
  }
  const applyCab = () => {
    if (!sound || !cab) return
    if (cab.speakers !== undefined) {
      const key = JSON.stringify(cab.speakers ?? null)
      if (key !== cabSeen.speakers) {
        cabSeen.speakers = key
        sound.speakers(cab.speakers)
      }
    }
    if (cab.head) {
      const key = JSON.stringify(cab.head)
      if (key !== cabSeen.head) {
        cabSeen.head = key
        sound.head(cab.head)
      }
    }
    const outsideKey = `${Boolean(cab.outside)}:${Number(cab.distance || 0).toFixed(2)}`
    if (outsideKey !== cabSeen.outside) {
      cabSeen.outside = outsideKey
      sound.outside(cab.outside, cab.distance)
    }
    const eqKey = JSON.stringify(cab.equalizer ?? null)
    if (eqKey !== cabSeen.equalizer) {
      cabSeen.equalizer = eqKey
      sound.equalizer(cab.equalizer)
    }
    const spectrumWanted = Boolean(cab.spectrum)
    if (spectrumWanted !== cabSeen.spectrum) {
      cabSeen.spectrum = spectrumWanted
      sound.spectrum(spectrumWanted)
    }
  }

  const formatPlayCount = (value) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return undefined
    if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
    return String(Math.round(n))
  }

  const toCoverUrl = (item) => {
    if (!item) return null
    let url =
      (typeof item === 'string' ? item : null) ||
      item.albumCoverPath ||
      item.trackCoverPath ||
      item.itemCoverUrl ||
      item.coverLarge ||
      item.coverPath ||
      item.cover_path ||
      item.coverMiddle ||
      item.coverSmall ||
      item.coverUrl ||
      item.albumCoverUrl290 ||
      item.cover ||
      item.artwork ||
      item.picUrl ||
      null
    if (typeof url !== 'string' || !url.trim()) return null
    url = url.trim()
    if (url.startsWith('//')) {
      url = 'https:' + url
    } else if (url.startsWith('http://')) {
      url = 'https://' + url.slice(7)
    } else if (!url.startsWith('http')) {
      if (url.startsWith('/')) {
        url = 'https://imagev2.xmcdn.com' + url
      } else {
        url = 'https://imagev2.xmcdn.com/' + url
      }
    }
    return url
  }

  function aesDecryptEcbHexKey(base64Cipher, hexKey) {
    try {
      const keyBytes = []
      for (let i = 0; i < 32; i += 2) {
        keyBytes.push(parseInt(hexKey.substr(i, 2), 16))
      }
      let b64 = base64Cipher.replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4 !== 0) b64 += '='
      const rawStr = atob(b64)
      const input = new Uint8Array(rawStr.length)
      for (let i = 0; i < rawStr.length; i++) input[i] = rawStr.charCodeAt(i)
      if (input.length === 0 || input.length % 16 !== 0) return null

      const Sbox = [
        0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76, 0xca, 0x82,
        0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0, 0xb7, 0xfd, 0x93, 0x26,
        0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15, 0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96,
        0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75, 0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0,
        0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84, 0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb,
        0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf, 0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f,
        0x50, 0x3c, 0x9f, 0xa8, 0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff,
        0xf3, 0xd2, 0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
        0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb, 0xe0, 0x32,
        0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79, 0xe7, 0xc8, 0x37, 0x6d,
        0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08, 0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6,
        0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a, 0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e,
        0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e, 0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e,
        0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf, 0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f,
        0xb0, 0x54, 0xbb, 0x16,
      ]
      const InvSbox = new Uint8Array(256)
      for (let i = 0; i < 256; i++) InvSbox[Sbox[i]] = i

      const Rcon = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]
      const w = new Uint32Array(44)
      for (let i = 0; i < 4; i++) {
        w[i] = (keyBytes[4 * i] << 24) | (keyBytes[4 * i + 1] << 16) | (keyBytes[4 * i + 2] << 8) | keyBytes[4 * i + 3]
      }
      for (let i = 4; i < 44; i++) {
        let temp = w[i - 1]
        if (i % 4 === 0) {
          temp = ((temp << 8) | (temp >>> 24)) >>> 0
          temp =
            ((Sbox[(temp >>> 24) & 0xff] << 24) |
              (Sbox[(temp >>> 16) & 0xff] << 16) |
              (Sbox[(temp >>> 8) & 0xff] << 8) |
              Sbox[temp & 0xff]) >>>
            0
          temp ^= Rcon[i / 4] << 24
        }
        w[i] = (w[i - 4] ^ temp) >>> 0
      }

      function mul(a, b) {
        let p = 0
        for (let c = 0; c < 8; c++) {
          if (b & 1) p ^= a
          const hi = a & 0x80
          a = (a << 1) & 0xff
          if (hi) a ^= 0x1b
          b >>= 1
        }
        return p
      }

      function invMixColumn(col) {
        const a = col[0],
          b = col[1],
          c = col[2],
          d = col[3]
        return [
          mul(0x0e, a) ^ mul(0x0b, b) ^ mul(0x0d, c) ^ mul(0x09, d),
          mul(0x09, a) ^ mul(0x0e, b) ^ mul(0x0b, c) ^ mul(0x0d, d),
          mul(0x0d, a) ^ mul(0x09, b) ^ mul(0x0e, c) ^ mul(0x0b, d),
          mul(0x0b, a) ^ mul(0x0d, b) ^ mul(0x09, c) ^ mul(0x0e, d),
        ]
      }

      function decryptBlock(block, out, offset) {
        const state = [[], [], [], []]
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) state[r][c] = block[r + 4 * c]
        }
        for (let c = 0; c < 4; c++) {
          const kw = w[40 + c]
          state[0][c] ^= (kw >>> 24) & 0xff
          state[1][c] ^= (kw >>> 16) & 0xff
          state[2][c] ^= (kw >>> 8) & 0xff
          state[3][c] ^= kw & 0xff
        }
        for (let round = 9; round >= 1; round--) {
          let t = state[1][3]
          state[1][3] = state[1][2]
          state[1][2] = state[1][1]
          state[1][1] = state[1][0]
          state[1][0] = t
          t = state[2][0]
          state[2][0] = state[2][2]
          state[2][2] = t
          t = state[2][1]
          state[2][1] = state[2][3]
          state[2][3] = t
          t = state[3][0]
          state[3][0] = state[3][1]
          state[3][1] = state[3][2]
          state[3][2] = state[3][3]
          state[3][3] = t

          for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) state[r][c] = InvSbox[state[r][c]]
          }

          for (let c = 0; c < 4; c++) {
            const kw = w[round * 4 + c]
            state[0][c] ^= (kw >>> 24) & 0xff
            state[1][c] ^= (kw >>> 16) & 0xff
            state[2][c] ^= (kw >>> 8) & 0xff
            state[3][c] ^= kw & 0xff
          }

          for (let c = 0; c < 4; c++) {
            const col = [state[0][c], state[1][c], state[2][c], state[3][c]]
            const mixed = invMixColumn(col)
            state[0][c] = mixed[0]
            state[1][c] = mixed[1]
            state[2][c] = mixed[2]
            state[3][c] = mixed[3]
          }
        }

        let t = state[1][3]
        state[1][3] = state[1][2]
        state[1][2] = state[1][1]
        state[1][1] = state[1][0]
        state[1][0] = t
        t = state[2][0]
        state[2][0] = state[2][2]
        state[2][2] = t
        t = state[2][1]
        state[2][1] = state[2][3]
        state[2][3] = t
        t = state[3][0]
        state[3][0] = state[3][1]
        state[3][1] = state[3][2]
        state[3][2] = state[3][3]
        state[3][3] = t

        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) state[r][c] = InvSbox[state[r][c]]
        }

        for (let c = 0; c < 4; c++) {
          const kw = w[c]
          state[0][c] ^= (kw >>> 24) & 0xff
          state[1][c] ^= (kw >>> 16) & 0xff
          state[2][c] ^= (kw >>> 8) & 0xff
          state[3][c] ^= kw & 0xff
        }

        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) out[offset + r + 4 * c] = state[r][c]
        }
      }

      const decryptedBytes = new Uint8Array(input.length)
      for (let i = 0; i < input.length; i += 16) {
        decryptBlock(input.subarray(i, i + 16), decryptedBytes, i)
      }

      const padLen = decryptedBytes[decryptedBytes.length - 1]
      const valid =
        padLen > 0 && padLen <= 16 ? decryptedBytes.subarray(0, decryptedBytes.length - padLen) : decryptedBytes
      return new TextDecoder('utf-8').decode(valid)
    } catch {
      return null
    }
  }

  const hookAudio = (el) => {
    if (currentAudio) return
    currentAudio = el
    if (window.westplayCabSound) sound = window.westplayCabSound(() => currentAudio, post)
    applyCab()
    el.addEventListener('playing', () => {
      if (!wanted || el.paused) {
        el.pause()
        return
      }
      clearTimeout(watchdog)
      clearTimeout(waitingTimer)
      waitingTimer = null
      clearTimeout(stableTimer)
      const seq = playAttemptSeq,
        track = currentTrack
      stableTimer = setTimeout(() => {
        stableTimer = null
        if (valid(seq, track) && status === 'playing') {
          retries = 0
          unexpectedPauses = 0
        }
      }, STABLE_PLAYBACK_MS)
      status = 'playing'
      error = null
      isPlaying = true
      sendPlayback()
      checkStatus()
    })
    el.addEventListener('pause', () => {
      if (!wanted || status !== 'playing') return
      clearTimeout(waitingTimer)
      waitingTimer = null
      clearTimeout(stableTimer)
      stableTimer = null
      if (el.error) {
        failed(playAttemptSeq, currentTrack, 'Media error ' + el.error.code)
        return
      }
      const now = Date.now()
      if (now - lastUnexpectedPauseAt > PAUSE_BURST_WINDOW_MS) unexpectedPauses = 0
      lastUnexpectedPauseAt = now
      unexpectedPauses++
      if (unexpectedPauses > MAX_UNEXPECTED_PAUSES) {
        failed(playAttemptSeq, currentTrack, 'Unexpected audio pause')
        return
      }
      const seq = playAttemptSeq,
        track = currentTrack
      isPlaying = false
      status = 'loading'
      error = 'Unexpected audio pause'
      sendPlayback()
      checkStatus()
      armWatchdog(seq, track)
      Promise.resolve(el.play()).catch((e) => {
        if (valid(seq, track)) failed(seq, track, String(e?.message || e || 'Unexpected audio pause'))
      })
    })
    el.addEventListener('waiting', () => {
      if (!wanted) return
      const seq = playAttemptSeq,
        track = currentTrack
      armWatchdog(seq, track)
      if (status !== 'playing') {
        isPlaying = false
        status = 'loading'
        sendPlayback()
        checkStatus()
        return
      }
      if (waitingTimer) return
      waitingTimer = setTimeout(() => {
        waitingTimer = null
        if (!valid(seq, track) || status !== 'playing') return
        clearTimeout(stableTimer)
        stableTimer = null
        isPlaying = false
        status = 'loading'
        sendPlayback()
        checkStatus()
      }, WAITING_DEBOUNCE_MS)
    })
    el.addEventListener('timeupdate', () => {
      if (wanted && !currentTrack?.radio) sendPlayback()
    })
    el.addEventListener('error', () => {
      if (wanted && el.error) failed(playAttemptSeq, currentTrack, 'Media error ' + el.error.code)
    })
    el.addEventListener('ended', () => {
      if (!wanted) return
      if (currentTrack?.radio) {
        failed(playAttemptSeq, currentTrack, 'Live stream ended')
        return
      }
      wanted = false
      isPlaying = false
      status = 'ended'
      sendPlayback()
      checkStatus()
    })
  }
  const ensureAudio = () => {
    if (currentAudio) return currentAudio
    const el = document.createElement('audio')
    el.id = 'wp-ximalaya-audio'
    el.preload = 'auto'
    el.crossOrigin = 'anonymous'
    ;(document.body || document.documentElement).appendChild(el)
    hookAudio(el)
    return el
  }
  let lastState = ''
  let signedInKnown = null
  let checkingAuth = false
  let lastAuthCheckAt = 0

  const emitState = () => {
    if (signedInKnown === null) return
    const value = JSON.stringify({ signedIn: signedInKnown, playing: isPlaying })
    if (value !== lastState) {
      lastState = value
      post({ type: 'state', state: JSON.parse(value) })
    }
  }

  const refreshAuth = async (force = false) => {
    const now = Date.now()
    if (checkingAuth) return
    if (!force && signedInKnown !== null && now - lastAuthCheckAt < 30000) return
    checkingAuth = true
    lastAuthCheckAt = now
    try {
      const res = await fetch('https://www.ximalaya.com/revision/main/getCurrentUser', {
        credentials: 'include',
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json()
        signedInKnown = Boolean(data?.ret === 200 && data?.data?.uid)
      }
    } catch {
      if (signedInKnown === null) {
        signedInKnown = document.cookie.includes('1_l_flag')
      }
    } finally {
      checkingAuth = false
      emitState()
    }
  }

  const checkStatus = () => {
    emitState()
    void refreshAuth(false)
  }
  const sendPlayback = () => {
    if (!currentTrack) return
    post({
      type: 'playback',
      playback: {
        title: currentTrack.title || 'Unknown Title',
        artist: currentTrack.artist || currentTrack.album || '喜马拉雅',
        artwork: toCoverUrl(currentTrack),
        duration: currentTrack.radio ? 0 : finite(currentAudio?.duration) || currentTrack.duration || 0,
        position: currentTrack.radio ? 0 : finite(currentAudio?.currentTime),
        status,
        owner: currentTrack.radio ? 'radio' : 'ximalaya',
        trackId: currentTrack.radio ? undefined : String(currentTrack.id || ''),
        albumId: currentTrack.radio ? undefined : currentTrack.albumId || undefined,
        isSample: currentTrack.radio ? undefined : Boolean(currentTrack.isSample),
        radioId: currentTrack.radioId,
        isLive: Boolean(currentTrack.radio),
        requestId,
        error,
      },
    })
  }
  setInterval(() => {
    sound?.tick()
    checkStatus()
  }, 1000)

  window.westplayXimalayaCommand = (cmd) => {
    handleHost(cmd)
  }
  window.chrome?.webview?.addEventListener('message', (event) => {
    try {
      const data = event.data
      handleHost(typeof data === 'string' ? JSON.parse(data) : data)
    } catch (e) {
      console.error('Ximalaya IPC parse error', e)
    }
  })

  const resolveAudioUrl = async (track, signal) => {
    if (!track) return { url: null, isSample: false, error: '无效的声音条目' }
    const trackId = track.id || track.trackId
    const hasRealId = trackId && /^\d+$/.test(String(trackId))
    if (!hasRealId && track.url && (track.url.startsWith('http://') || track.url.startsWith('https://'))) {
      return { url: track.url, isSample: false, error: null }
    }
    if (!trackId) return { url: null, isSample: false, error: '缺少声音 ID' }

    let paidLocked = false

    // 1. Modern Web & H5 play info API: mobile-playpage/track/v3/baseInfo
    try {
      const timestamp = Date.now()
      const res = await fetch(
        `https://www.ximalaya.com/mobile-playpage/track/v3/baseInfo/${timestamp}?device=web&trackId=${encodeURIComponent(trackId)}&trackQualityLevel=1`,
        {
          signal,
          credentials: 'include',
        },
      )
      if (res.ok) {
        const data = await res.json()
        const trackInfo = data?.trackInfo
        if (trackInfo) {
          if (currentTrack === track && !signal?.aborted) {
            if (!track.artwork) {
              const art = toCoverUrl(trackInfo)
              if (art && currentTrack) {
                currentTrack.artwork = art
                sendPlayback()
              }
            }
          }
          const isPaid = Boolean(trackInfo.isPaid || trackInfo.paidType > 0)
          const isAuthorized = !isPaid || trackInfo.isFree === true || trackInfo.isAuthorized === true
          const isSample = Boolean(trackInfo.isSample || (isPaid && !isAuthorized && trackInfo.sampleDuration > 0))
          const list = trackInfo.playUrlList
          if (Array.isArray(list) && list.length > 0) {
            for (const item of list) {
              if (item?.url) {
                if (item.url.startsWith('http')) return { url: item.url, isSample, error: null }
                const dec = aesDecryptEcbHexKey(item.url, 'aaad3e4fd540b0f79dca95606e72bf93')
                if (dec && dec.startsWith('http')) return { url: dec, isSample, error: null }
              }
            }
          }
          if (trackInfo.playPath && trackInfo.playPath.startsWith('http')) {
            return { url: trackInfo.playPath, isSample, error: null }
          }
          if (trackInfo.downloadUrl && trackInfo.downloadUrl.startsWith('http')) {
            return { url: trackInfo.downloadUrl, isSample, error: null }
          }
          if (isPaid && !isAuthorized) paidLocked = true
        }
      }
    } catch (e) {
      if (signal?.aborted) throw e
      console.warn('[ximalaya] mobile-playpage error', e)
    }

    // 2. Revision play APIs (effective when signed in with www.ximalaya.com cookies)
    try {
      const res = await fetch(
        `https://www.ximalaya.com/revision/play/v1/audio?id=${encodeURIComponent(trackId)}&ptype=1`,
        { credentials: 'include', signal },
      )
      if (res.ok) {
        const data = await res.json()
        const src = data?.data?.src || data?.src
        if (src && src.startsWith('http')) {
          return { url: src, isSample: Boolean(data?.data?.hasBuy === false && data?.data?.isPaid), error: null }
        }
        if (data?.data?.isPaid && data?.data?.hasBuy === false) paidLocked = true
      }
    } catch (e) {
      if (signal?.aborted) throw e
    }

    try {
      const res = await fetch(`https://www.ximalaya.com/revision/play/v1/show?id=${encodeURIComponent(trackId)}`, {
        credentials: 'include',
        signal,
      })
      if (res.ok) {
        const data = await res.json()
        const src = data?.data?.src || data?.src
        if (src && src.startsWith('http')) return { url: src, isSample: false, error: null }
      }
    } catch (e) {
      if (signal?.aborted) throw e
    }

    return {
      url: null,
      isSample: false,
      error:
        paidLocked || track.isPaid
          ? '该声音为喜马拉雅 VIP/付费内容，请在桌面扫码登录会员账号后收听'
          : '无法获取该声音播放地址，请稍后重试',
    }
  }

  const stopHls = () => {
    if (hls) {
      try {
        hls.destroy()
      } catch {}
      hls = null
    }
  }

  const valid = (seq, track) => wanted && seq === playAttemptSeq && currentTrack === track
  const cancel = (clear) => {
    ++playAttemptSeq
    wanted = false
    isPlaying = false
    controller?.abort()
    controller = null
    clearTimeout(retryTimer)
    retryTimer = null
    clearTimeout(watchdog)
    clearTimeout(waitingTimer)
    waitingTimer = null
    clearTimeout(stableTimer)
    stableTimer = null
    stopHls()
    if (currentAudio) {
      currentAudio.pause()
      if (clear) {
        currentAudio.removeAttribute('src')
        currentAudio.load()
      }
    }
  }
  const armWatchdog = (seq, track) => {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => failed(seq, track, 'Connection timed out'), 20000)
  }
  const failed = (seq, track, message) => {
    if (!valid(seq, track) || retryTimer) return
    clearTimeout(watchdog)
    clearTimeout(waitingTimer)
    waitingTimer = null
    clearTimeout(stableTimer)
    stableTimer = null
    isPlaying = false
    status = 'loading'
    error = message
    controller?.abort()
    stopHls()
    currentAudio?.pause()
    if (track.radio && retries < RADIO_RETRY_DELAYS.length) {
      const delay = RADIO_RETRY_DELAYS[retries++]
      retryTimer = setTimeout(() => {
        retryTimer = null
        if (valid(seq, track)) connect(seq, track)
      }, delay)
    } else {
      wanted = false
      status = 'failed'
    }
    sendPlayback()
    checkStatus()
  }
  const connect = async (seq, track) => {
    if (!valid(seq, track)) return
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    armWatchdog(seq, track)
    try {
      const audio = ensureAudio()
      audio.playbackRate = track.radio ? 1 : speed
      audio.volume = volume
      audio.muted = false
      let streamUrl = track.url
      if (track.radio) {
        const detail = await radioJson('/v1/radio?radioId=' + encodeURIComponent(track.radioId), signal)
        if (!valid(seq, track)) return
        track.title = detail.programName || detail.name
        track.artist = detail.name
        track.artwork = toCoverUrl(detail)
        const native = Boolean(audio.canPlayType('application/vnd.apple.mpegurl'))
        streamUrl = native
          ? detail.playUrl?.aac64 || detail.playUrl?.aac24
          : detail.playUrl?.ts64 || detail.playUrl?.ts24 || detail.playUrl?.aac64
        if (!streamUrl) throw new Error('No live stream available')
        const parsed = new URL(streamUrl)
        if (parsed.protocol === 'http:' && /(^|\.)(ximalaya\.com|xmcdn\.com)$/.test(parsed.hostname))
          parsed.protocol = 'https:'
        if (parsed.protocol !== 'https:') throw new Error('Unsupported stream URL')
        streamUrl = parsed.href
        if (!native) {
          if (!PlayerHls?.isSupported()) throw new Error('HLS is not supported')
          const instance = new PlayerHls({
            enableWorker: true,
            manifestLoadingMaxRetry: 4,
            levelLoadingMaxRetry: 4,
            fragLoadingMaxRetry: 4,
            backBufferLength: 30,
          })
          stopHls()
          hls = instance
          instance.on(PlayerHls.Events.MEDIA_ATTACHED, () => {
            if (valid(seq, track) && hls === instance) instance.loadSource(streamUrl)
          })
          instance.on(PlayerHls.Events.MANIFEST_PARSED, () => {
            if (valid(seq, track) && hls === instance) audio.play().catch((e) => failed(seq, track, String(e)))
          })
          instance.on(PlayerHls.Events.ERROR, (_event, data) => {
            if (data?.fatal && hls === instance) failed(seq, track, data.details || 'HLS error')
          })
          instance.attachMedia(audio)
          sendPlayback()
          return
        }
      } else {
        const hasRealId = /^\d+$/.test(String(track.id))
        if (!streamUrl || hasRealId) {
          const resolved = await resolveAudioUrl(track, signal)
          if (!valid(seq, track)) return
          if (!resolved.url) {
            throw new Error(resolved.error || '无法获取音频播放地址')
          }
          streamUrl = resolved.url
          track.isSample = Boolean(resolved.isSample)
        }
      }
      if (!valid(seq, track)) return
      audio.src = streamUrl
      await audio.play()
    } catch (e) {
      if (!valid(seq, track) || e.name === 'AbortError') return
      failed(seq, track, String(e.message || e))
    }
  }
  const playTrack = async (track) => {
    cancel(true)
    currentTrack = track
    wanted = true
    status = 'loading'
    error = null
    retries = 0
    unexpectedPauses = 0
    lastUnexpectedPauseAt = 0
    sendPlayback()
    checkStatus()
    await connect(playAttemptSeq, track)
  }
  const handleHost = async (cmd) => {
    if (!cmd || typeof cmd !== 'object') return
    const { action } = cmd
    if (action === 'start') {
      void refreshAuth(true)
    } else if (action === 'play') {
      requestId = cmd.requestId ?? null
      if (cmd.track || currentTrack?.radio || !currentAudio?.src) {
        if (cmd.track || currentTrack) await playTrack(cmd.track || currentTrack)
      } else {
        wanted = true
        status = 'loading'
        sendPlayback()
        const seq = playAttemptSeq,
          track = currentTrack
        armWatchdog(seq, track)
        currentAudio.play().catch((e) => failed(seq, track, String(e)))
      }
    } else if (action === 'pause') {
      requestId = cmd.requestId ?? requestId
      status = 'paused'
      cancel(Boolean(currentTrack?.radio))
      sendPlayback()
      checkStatus()
    } else if (action === 'seek') {
      if (!currentTrack?.radio && currentAudio && typeof cmd.seconds === 'number')
        currentAudio.currentTime = cmd.seconds
    } else if (action === 'speed') {
      speed = cmd.rate
      if (currentAudio && !currentTrack?.radio) currentAudio.playbackRate = speed
    } else if (action === 'volume') {
      volume = Math.max(0, Math.min(1, cmd.percent / 100))
      if (currentAudio) currentAudio.volume = volume
    } else if (action === 'cab') {
      cab = cmd
      applyCab()
    } else if (action === 'ask') {
      handleAsk(cmd.id, cmd.question)
    }
  }
  setInterval(async () => {
    const seq = playAttemptSeq,
      track = currentTrack
    if (!track?.radio || !wanted) return
    try {
      const detail = await radioJson('/v1/radio?radioId=' + track.radioId)
      if (!valid(seq, track)) return
      track.title = detail.programName || detail.name
      track.artist = detail.name
      track.artwork = toCoverUrl(detail)
      sendPlayback()
    } catch {
      /* Metadata failure must not interrupt audio. */
    }
  }, 60000)

  const CATEGORY_SLUG_MAP = {
    youshengshu: 3,
    book: 3,
    xiangsheng: 12,
    comic: 12,
    lishi: 9,
    culture: 9,
    shangye: 8,
    finance: 8,
    renwen: 39,
    yinyue: 2,
    music: 2,
    qinggan: 10,
    emotion: 10,
    toutiao: 1,
    news: 1,
    ertong: 6,
    kid: 6,
    yule: 4,
    entertainment: 4,
    duanzi: 48,
    keji: 18,
    it: 18,
    guangbojv: 46,
    diantai: 10,
  }

  const fetchJson = async (url, options = {}) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), ...options })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.json()
  }

  const mapCategoryAlbum = (a) => ({
    id: String(a.albumId || a.id),
    title: a.albumTitle || a.title || '有声专辑',
    artist: a.albumUserNickName || a.anchorName || a.nickname || '喜马拉雅主播',
    artwork: toCoverUrl(a),
    description: a.intro || a.description || '',
    episodeCount: Number(a.albumTrackCount || a.trackCount || 0) || undefined,
    playCount: formatPlayCount(a.albumPlayCount || a.playCount),
    completed: a.isFinished === 2 ? true : a.isFinished === 1 ? false : undefined,
    isPaid: Boolean(a.isPaid),
    vipType: typeof a.vipType === 'number' ? a.vipType : undefined,
    tag: a.isPaid ? 'VIP' : a.isFinished === 2 ? '完结' : undefined,
  })

  const mapRankAlbum = (item) => {
    const info = item?.albumInfo || item || {}
    const stats = item?.statCountInfo || {}
    const uri = item?.pageUriInfo || {}
    const isPaid = Boolean(info.albumPayType > 0 || info.albumVipPayType > 0 || info.isPaid)
    return {
      id: String(info.id || item?.id),
      title: info.title || '热门专辑',
      artist: info.anchorName || uri.categoryName || '喜马拉雅精选',
      artwork: toCoverUrl(info),
      description: info.customTitle || info.shortIntro || info.salePoint || '',
      episodeCount: Number(stats.trackCount || 0) || undefined,
      playCount: formatPlayCount(stats.playCount),
      category: uri.categoryName || undefined,
      completed: info.albumFinishTag === 2 ? true : info.albumFinishTag === 1 ? false : undefined,
      isPaid,
      tag: isPaid ? 'VIP' : uri.categoryName || undefined,
    }
  }

  const fetchCategories = async () => {
    const data = await fetchJson('https://www.ximalaya.com/revision/category/allCategoryInfo', {
      credentials: 'include',
    })
    const groups = Array.isArray(data?.data) ? data.data : []
    const seen = new Set()
    const list = []
    for (const group of groups) {
      for (const cat of group?.categories || []) {
        const id = Number(cat.id)
        if (!id || seen.has(id)) continue
        seen.add(id)
        const linkSlug = String(cat.link || '')
          .replace(/^\/|\/$/g, '')
          .split('/')[0]
        list.push({
          id,
          name: cat.displayName || cat.name || '分类',
          code: linkSlug || cat.name || String(id),
          group: group.name || undefined,
        })
      }
    }
    return list
  }

  const fetchRankAlbums = async (cluster = 'free', categoryCode = 'all', page = 1, pageSize = 30) => {
    const data = await fetchJson(
      `https://www.ximalaya.com/m-revision/page/rank/queryRank?clusterCode=${encodeURIComponent(cluster)}&categoryCode=${encodeURIComponent(categoryCode)}&page=${page}&pageSize=${pageSize}`,
      { credentials: 'include' },
    )
    const raw = data?.data?.rankModuleInfoList || []
    return raw.map(mapRankAlbum).filter((a) => a.id && a.id !== 'undefined')
  }

  const handleAsk = async (id, question) => {
    try {
      if (
        question.ask === 'radioHome' ||
        question.ask === 'radioList' ||
        question.ask === 'radioDetail' ||
        question.ask === 'radioSchedule'
      ) {
        const root = 'https://mobile.ximalaya.com/radio-first-page-app'
        let url = root + '/homePage'
        let kind = 'home'
        if (question.ask === 'radioList') {
          const params = new URLSearchParams({
            locationId: String(question.locationId),
            locationTypeId: String(question.locationTypeId),
            categoryId: String(question.categoryId),
            pageNum: String(question.pageNum),
            pageSize: '48',
          })
          url = root + '/search?' + params.toString()
          kind = 'list'
        } else if (question.ask === 'radioDetail') {
          url = root + '/v1/radio?radioId=' + encodeURIComponent(question.radioId)
          kind = 'detail'
        } else if (question.ask === 'radioSchedule') {
          url = root + '/v1/getProgramSchedules?device=ios&radioId=' + encodeURIComponent(question.radioId)
          kind = 'schedule'
        }
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!response.ok) throw new Error('电台接口请求失败')
        const payload = await response.json()
        if (payload.ret !== 0 && payload.ret !== '0000') throw new Error(payload.msg || '电台接口请求失败')
        post({ type: 'answer', answer: { id, radio: { kind, data: payload.data ?? payload.result ?? null } } })
      } else if (question.ask === 'categories') {
        const categories = await fetchCategories()
        post({ type: 'answer', answer: { id, categories } })
      } else if (question.ask === 'home' || question.ask === 'recommend') {
        const [freeRes, riseRes, catRes] = await Promise.allSettled([
          fetchRankAlbums('free', 'all', 1, 24),
          fetchRankAlbums('rise', 'all', 1, 18),
          fetchCategories(),
        ])
        const albums = freeRes.status === 'fulfilled' ? freeRes.value : []
        const riseAlbums = riseRes.status === 'fulfilled' ? riseRes.value : []
        const categories = catRes.status === 'fulfilled' ? catRes.value : []
        if (!albums.length && !riseAlbums.length) {
          const fallback = await fetchJson(
            'https://www.ximalaya.com/revision/category/v2/albums?pageNum=1&pageSize=24&sort=1',
            { credentials: 'include' },
          )
          const list = (fallback?.data?.albums || []).map(mapCategoryAlbum)
          post({ type: 'answer', answer: { id, albums: list, riseAlbums: [], categories } })
        } else {
          post({ type: 'answer', answer: { id, albums, riseAlbums, categories } })
        }
      } else if (question.ask === 'category') {
        const page = Math.max(1, Number(question.page) || 1)
        const sort = typeof question.sort === 'number' ? question.sort : 1
        const slug = String(question.category || '').toLowerCase()
        const categoryId = Number(question.categoryId) || CATEGORY_SLUG_MAP[slug] || 0
        const params = new URLSearchParams({
          pageNum: String(page),
          pageSize: '24',
          sort: String(sort),
        })
        if (categoryId > 0) params.set('categoryId', String(categoryId))
        const data = await fetchJson(`https://www.ximalaya.com/revision/category/v2/albums?${params.toString()}`, {
          credentials: 'include',
        })
        const list = (data?.data?.albums || data?.data?.albumList || []).map(mapCategoryAlbum)
        const totalCount = Number(data?.data?.total || list.length)
        const maxPage = Math.max(1, Math.ceil(totalCount / 24))
        post({ type: 'answer', answer: { id, albums: list, totalCount, page, maxPage } })
      } else if (question.ask === 'rank') {
        const cluster = question.cluster || 'free'
        const categoryCode = question.categoryCode || 'all'
        const page = Math.max(1, Number(question.page) || 1)
        const albums = await fetchRankAlbums(cluster, categoryCode, page, 30)
        post({ type: 'answer', answer: { id, albums, page } })
      } else if (question.ask === 'albumDetail') {
        const data = await fetchJson(
          `https://www.ximalaya.com/m-revision/page/album/v2/queryAlbumPage/${encodeURIComponent(question.albumId)}`,
          { credentials: 'include' },
        )
        const detail = data?.data?.albumDetailInfo || {}
        const info = detail.albumInfo || {}
        const stats = detail.statCountInfo || {}
        const anchor = detail.anchorInfo || {}
        const album = {
          id: String(info.id || question.albumId),
          title: info.title || '有声专辑',
          artist: anchor.nickname || info.anchorName || '喜马拉雅主播',
          artwork: toCoverUrl(info),
          description: info.shortIntro || info.customTitle || info.detailRichIntro?.replace(/<[^>]+>/g, '') || '',
          episodeCount: Number(stats.trackCount || 0) || undefined,
          playCount: formatPlayCount(stats.playCount),
          completed: info.albumFinishTag === 2 ? true : info.albumFinishTag === 1 ? false : undefined,
          isPaid: Boolean(info.albumPayType > 0 || info.price),
          category: info.categoryName || undefined,
        }
        post({ type: 'answer', answer: { id, album } })
      } else if (question.ask === 'albumTracks') {
        const page = Math.max(1, Number(question.page) || 1)
        const asc = question.asc !== false
        const sort = asc ? 0 : 1
        let tracks = []
        let totalCount = 0
        let maxPage = 1

        // 1. Same-origin authenticated track list (full metadata + exact trackTotalCount when signed in)
        try {
          const data = await fetchJson(
            `https://www.ximalaya.com/revision/album/v1/getTracksList?albumId=${encodeURIComponent(question.albumId)}&pageNum=${page}&pageSize=50&sort=${sort}`,
            { credentials: 'include' },
          )
          const list = data?.ret === 200 ? data?.data?.tracks || [] : []
          if (list.length > 0) {
            totalCount = Number(data?.data?.trackTotalCount || list.length)
            maxPage = Math.max(1, Math.ceil(totalCount / 50))
            tracks = list.map((t, idx) => ({
              id: String(t.trackId),
              title: t.title || `第${idx + 1}集`,
              artist: t.anchorName || '喜马拉雅主播',
              album: t.albumTitle || undefined,
              albumId: String(question.albumId),
              duration: Number(t.duration || 0),
              artwork: toCoverUrl(t),
              episodeNumber: Number(t.index || (page - 1) * 50 + idx + 1),
              playCount: formatPlayCount(t.playCount),
              isPaid: Boolean(t.isPaid),
              isFree: !t.isPaid,
              isAuthorized: !t.isPaid || Boolean(t.isAuthorized),
            }))
          }
        } catch (e) {
          console.warn('[ximalaya] revision getTracksList error', e)
        }

        // 2. Universal same-origin track list (works both signed-in and anonymous, zero CORS issues)
        if (tracks.length === 0) {
          const [showRes, pageRes] = await Promise.allSettled([
            fetchJson(
              `https://www.ximalaya.com/revision/play/v1/show?id=${encodeURIComponent(question.albumId)}&num=${page}&sort=${sort}&size=50&ptype=0`,
              { credentials: 'include' },
            ),
            fetchJson(
              `https://www.ximalaya.com/m-revision/page/album/v2/queryAlbumPage/${encodeURIComponent(question.albumId)}`,
              { credentials: 'include' },
            ),
          ])
          if (showRes.status === 'rejected') throw showRes.reason
          const showData = showRes.value?.data || {}
          const list = showData.tracksAudioPlay || []
          const pageDetail = pageRes.status === 'fulfilled' ? pageRes.value?.data?.albumDetailInfo || {} : {}
          const anchorName = pageDetail?.anchorInfo?.nickname || pageDetail?.albumInfo?.anchorName || '喜马拉雅主播'
          const albumTotal = Number(pageDetail?.statCountInfo?.trackCount || 0)
          totalCount = albumTotal || (showData.hasMore ? page * 50 + 1 : (page - 1) * 50 + list.length)
          maxPage = Math.max(1, Math.ceil(totalCount / 50))
          tracks = list.map((t, idx) => ({
            id: String(t.trackId),
            title: t.trackName || t.title || `第${idx + 1}集`,
            artist: anchorName,
            album: t.albumName || pageDetail?.albumInfo?.title || undefined,
            albumId: String(question.albumId),
            duration: Number(t.duration || 0),
            artwork: toCoverUrl(t),
            episodeNumber: Number(t.index || (page - 1) * 50 + idx + 1),
            isPaid: Boolean(t.isPaid),
            isFree: t.isPaid ? Boolean(t.isFree) : true,
            isAuthorized: !t.isPaid || Boolean(t.isAuthorized),
          }))
        }

        post({ type: 'answer', answer: { id, tracks, totalCount, page, maxPage } })
      } else if (question.ask === 'search') {
        const kw = encodeURIComponent(question.query || '')
        const page = Math.max(1, Number(question.page) || 1)
        const [albRes, trkRes] = await Promise.allSettled([
          fetchJson(`https://search.ximalaya.com/front/v1?kw=${kw}&core=album&page=${page}&rows=18&device=iPhone`),
          fetchJson(`https://search.ximalaya.com/front/v1?kw=${kw}&core=track&page=${page}&rows=24&device=iPhone`),
        ])
        const albDocs = albRes.status === 'fulfilled' ? albRes.value?.response?.docs || [] : []
        const trkDocs = trkRes.status === 'fulfilled' ? trkRes.value?.response?.docs || [] : []
        const albums = albDocs.map((a) => ({
          id: String(a.id || a.albumId),
          title: a.title || '有声专辑',
          artist: a.nickname || a.anchorName || '喜马拉雅主播',
          artwork: toCoverUrl(a),
          description: a.intro || a.custom_title || '',
          episodeCount: Number(a.tracks || 0) || undefined,
          playCount: formatPlayCount(a.play),
          category: a.category_title || undefined,
          completed: a.is_finished === 2 ? true : a.is_finished === 1 ? false : undefined,
          isPaid: Boolean(a.is_paid),
          tag: a.is_paid ? 'VIP' : a.category_title || undefined,
        }))
        const tracks = trkDocs.map((t) => ({
          id: String(t.id || t.trackId),
          title: t.title || '声音片段',
          artist: t.nickname || t.anchorName || '喜马拉雅主播',
          album: t.album_title || t.albumTitle || '',
          albumId: t.album_id ? String(t.album_id) : undefined,
          artwork: toCoverUrl(t),
          duration: Number(t.duration || 0),
          playCount: formatPlayCount(t.count_play),
          isPaid: Boolean(t.is_paid),
        }))
        post({ type: 'answer', answer: { id, albums, tracks, page } })
      } else if (question.ask === 'hotSearch') {
        const data = await fetchJson('https://search.ximalaya.com/hotWordBillboard/list/2.0?categoryId=-1&size=12')
        const hotWords = (data?.hotWordResultList || [])
          .map((item) => item.display_word || item.word)
          .filter(Boolean)
        post({ type: 'answer', answer: { id, hotWords } })
      } else if (question.ask === 'userProfile') {
        const data = await fetchJson('https://www.ximalaya.com/revision/main/getCurrentUser', {
          credentials: 'include',
        })
        const u = data?.data
        const user =
          data?.ret === 200 && u
            ? {
                uid: u.uid ? String(u.uid) : undefined,
                nickname: u.nickname || u.userName || '喜马拉雅用户',
                avatar: toCoverUrl({ cover: u.logoPic || u.avatar }),
                isVip: Boolean(u.isVip || u.vipType > 0),
              }
            : undefined
        post({ type: 'answer', answer: { id, user } })
      } else if (question.ask === 'mySection') {
        const section = question.section || 'subscribed'
        const page = Math.max(1, Number(question.page) || 1)
        if (section === 'subscribed') {
          let data = await fetchJson(
            `https://www.ximalaya.com/revision/album/v1/sub/comprehensive?num=${page}&size=30&subType=2&category=all`,
            { credentials: 'include' },
          )
          if (data?.ret === 401 || data?.isNeedLogin) {
            post({ type: 'answer', answer: { id, needLogin: true, albums: [], totalCount: 0, page, maxPage: 1 } })
            return
          }
          let raw = data?.data?.albumResultList || data?.data?.albumsInfo || data?.data?.list || []
          if (raw.length === 0 && page === 1) {
            try {
              const alt = await fetchJson(
                `https://www.ximalaya.com/revision/my/getSubscriptionSynthesize?pageNum=${page}&pageSize=30`,
                { credentials: 'include' },
              )
              if (alt?.ret === 200) {
                data = alt
                raw = alt?.data?.albumsInfo || alt?.data?.albumResultList || alt?.data?.list || []
              }
            } catch {}
          }
          const totalCount = Number(data?.data?.totalCount || data?.data?.total || raw.length)
          const maxPage = Math.max(1, Math.ceil(totalCount / 30))
          const albums = raw.map((a) => ({
            id: String(a.albumId || a.id),
            title: a.albumTitle || a.title || '订阅专辑',
            artist: a.anchorName || a.nickname || a.albumUserNickName || '喜马拉雅主播',
            artwork: toCoverUrl(a),
            description: a.description || a.intro || '',
            episodeCount: Number(a.trackCount || a.albumTrackCount || 0) || undefined,
            playCount: formatPlayCount(a.playCount || a.albumPlayCount),
            completed: a.isFinished === 2 || a.isFinish === 2 ? true : a.isFinished === 1 || a.isFinish === 1 ? false : undefined,
            isPaid: Boolean(a.isPaid),
            tag: a.isPaid ? 'VIP' : undefined,
          }))
          post({ type: 'answer', answer: { id, albums, totalCount, page, maxPage } })
        } else if (section === 'listened') {
          const data = await fetchJson(
            'https://www.ximalaya.com/revision/track/history/listen?includeChannel=false&includeRadio=false',
            { credentials: 'include' },
          )
          if (data?.ret === 401 || data?.isNeedLogin) {
            post({ type: 'answer', answer: { id, needLogin: true, tracks: [], totalCount: 0, page: 1, maxPage: 1 } })
            return
          }
          const payload = data?.data || {}
          const merged = [
            ...(Array.isArray(payload.today) ? payload.today : []),
            ...(Array.isArray(payload.yesterday) ? payload.yesterday : []),
            ...(Array.isArray(payload.earlier) ? payload.earlier : []),
          ]
          const tracks = merged
            .filter((item) => item && (item.childId || item.trackId))
            .map((item) => ({
              id: String(item.childId || item.trackId),
              title: item.childTitle || item.trackTitle || item.title || '收听记录',
              artist: item.userName || item.anchorName || '喜马拉雅主播',
              album: item.itemTitle || item.albumName || undefined,
              albumId: item.itemId || item.albumId ? String(item.itemId || item.albumId) : undefined,
              artwork: toCoverUrl(item),
              duration: Number(item.length || item.duration || 0),
              playCount: item.startedAtFormatText || undefined,
            }))
          post({ type: 'answer', answer: { id, tracks, totalCount: tracks.length, page: 1, maxPage: 1 } })
        } else if (section === 'like') {
          const data = await fetchJson(
            `https://www.ximalaya.com/revision/my/getLikeTracks?pageNum=${page}&pageSize=30`,
            { credentials: 'include' },
          )
          if (data?.ret === 401 || data?.isNeedLogin) {
            post({ type: 'answer', answer: { id, needLogin: true, tracks: [], totalCount: 0, page, maxPage: 1 } })
            return
          }
          const raw = data?.data?.tracksList || data?.data?.list || []
          const totalCount = Number(data?.data?.totalCount || raw.length)
          const maxPage = Math.max(1, Math.ceil(totalCount / 30))
          const tracks = raw.map((t) => ({
            id: String(t.trackId || t.id),
            title: t.title || t.trackName || '喜欢的声音',
            artist: t.anchorName || t.nickname || '喜马拉雅主播',
            album: t.albumTitle || t.albumName || undefined,
            albumId: t.albumId ? String(t.albumId) : undefined,
            artwork: toCoverUrl(t),
            duration: Number(t.duration || 0),
            playCount: formatPlayCount(t.playCount),
            isPaid: Boolean(t.isPaid),
          }))
          post({ type: 'answer', answer: { id, tracks, totalCount, page, maxPage } })
        } else if (section === 'buy') {
          const data = await fetchJson(
            `https://www.ximalaya.com/revision/my/getHasBroughtAlbums?pageNum=${page}&pageSize=30`,
            { credentials: 'include' },
          )
          if (data?.ret === 401 || data?.isNeedLogin) {
            post({ type: 'answer', answer: { id, needLogin: true, albums: [], totalCount: 0, page, maxPage: 1 } })
            return
          }
          const raw = data?.data?.albumList || data?.data?.list || []
          const totalCount = Number(data?.data?.totalCount || raw.length)
          const maxPage = Math.max(1, Math.ceil(totalCount / 30))
          const albums = raw.map((a) => ({
            id: String(a.albumId || a.id),
            title: a.albumTitle || a.title || '已购专辑',
            artist: a.anchorName || a.nickname || '喜马拉雅主播',
            artwork: toCoverUrl(a),
            description: a.intro || a.description || '',
            episodeCount: Number(a.trackCount || a.albumTrackCount || 0) || undefined,
            playCount: formatPlayCount(a.playCount),
            completed: a.isFinish === 2 || a.isFinished === 2 ? true : a.isFinish === 1 || a.isFinished === 1 ? false : undefined,
            isPaid: true,
            tag: '已购',
          }))
          post({ type: 'answer', answer: { id, albums, totalCount, page, maxPage } })
        }
      }
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err?.message || err) } })
    }
  }

  checkStatus()
  post({ type: 'ready' })
})()
