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

  const toCoverUrl = (item) => {
    if (!item) return null
    let url =
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
  const checkStatus = () => {
    const signedIn = document.cookie.includes('1&_token') || document.cookie.includes('1_l_flag')
    const value = JSON.stringify({ signedIn, playing: isPlaying })
    if (value !== lastState) {
      lastState = value
      post({ type: 'state', state: JSON.parse(value) })
    }
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

  const FALLBACK_AUDIO_STREAMS = {
    scifi: 'https://aod.cos.tx.xmcdn.com/storages/ceef-audiofreehighqps/F2/8F/GKwRIUEH8NbRAZlykgIFt-eo-aacv2-48K.m4a',
    xiangsheng: 'https://aod.cos.tx.xmcdn.com/storages/1825-audiofreehighqps/F1/1F/GKwRIDoOW5CKAREisgTJPcGU.m4a',
    pingshu: 'https://aod.cos.tx.xmcdn.com/storages/a152-audiofreehighqps/D5/4C/GMCoOR4I0hiHACAAAAJYCShV.mp3',
    radio: 'https://aod.cos.tx.xmcdn.com/storages/a71e-audiofreehighqps/12/7A/GKwRIJIOu5J4AD4AjATy-pqV.m4a',
    dj: 'https://aod.cos.tx.xmcdn.com/storages/8551-audiofreehighqps/97/E4/GKwRIRwOjplnBPxIiwTeclL2.m4a',
    relax: 'https://aod.cos.tx.xmcdn.com/storages/aea8-audiofreehighqps/A4/17/GKwRIRwOx0GdAFzXCgT4dSWb.m4a',
    general: 'https://aod.cos.tx.xmcdn.com/group39/M07/34/82/wKgJnlqChT2jRXU8AEn2S2TpSzo586.m4a',
  }

  const getFallbackUrl = (track) => {
    if (!track) return FALLBACK_AUDIO_STREAMS.general
    const str = ((track.title || '') + ' ' + (track.album || '') + ' ' + (track.artist || '')).toLowerCase()
    if (
      str.includes('相声') ||
      str.includes('郭德纲') ||
      str.includes('于谦') ||
      str.includes('德云') ||
      str.includes('段子')
    ) {
      return FALLBACK_AUDIO_STREAMS.xiangsheng
    }
    if (
      str.includes('评书') ||
      str.includes('三国') ||
      str.includes('单田芳') ||
      str.includes('明朝') ||
      str.includes('历史')
    ) {
      return FALLBACK_AUDIO_STREAMS.pingshu
    }
    if (
      str.includes('三体') ||
      str.includes('科幻') ||
      str.includes('鬼吹灯') ||
      str.includes('盗墓') ||
      str.includes('修仙')
    ) {
      return FALLBACK_AUDIO_STREAMS.scifi
    }
    if (str.includes('dj') || str.includes('慢摇') || str.includes('重低音') || str.includes('电音')) {
      return FALLBACK_AUDIO_STREAMS.dj
    }
    if (
      str.includes('白噪') ||
      str.includes('雨夜') ||
      str.includes('治愈') ||
      str.includes('古典') ||
      str.includes('静心')
    ) {
      return FALLBACK_AUDIO_STREAMS.relax
    }
    if (str.includes('电台') || str.includes('晚安') || str.includes('夜行') || str.includes('卡车')) {
      return FALLBACK_AUDIO_STREAMS.radio
    }
    return FALLBACK_AUDIO_STREAMS.general
  }

  const resolveAudioUrl = async (track, signal) => {
    if (!track) return null
    const trackId = track.id || track.trackId
    const hasRealId = trackId && /^\d+$/.test(String(trackId))
    if (!hasRealId && track.url && (track.url.startsWith('http://') || track.url.startsWith('https://'))) {
      return track.url
    }
    if (!trackId) return null

    // 1. Modern Web & H5 play info API: mobile-playpage/track/v3/baseInfo
    try {
      const timestamp = Date.now()
      const res = await fetch(
        `https://www.ximalaya.com/mobile-playpage/track/v3/baseInfo/${timestamp}?device=web&trackId=${encodeURIComponent(trackId)}&trackQualityLevel=1`,
        {
          signal,
          credentials: 'include',
          signal,
        },
      )
      if (res.ok) {
        const data = await res.json()
        const trackInfo = data?.trackInfo
        if (trackInfo) {
          if (currentTrack === track && !signal?.aborted && !track.artwork) {
            const art = toCoverUrl(trackInfo)
            if (art && currentTrack) {
              currentTrack.artwork = art
              sendPlayback()
            }
          }
          const list = trackInfo.playUrlList
          if (Array.isArray(list) && list.length > 0) {
            for (const item of list) {
              if (item?.url) {
                if (item.url.startsWith('http')) return item.url
                const dec = aesDecryptEcbHexKey(item.url, 'aaad3e4fd540b0f79dca95606e72bf93')
                if (dec && dec.startsWith('http')) return dec
              }
            }
          }
          if (trackInfo.playPath && trackInfo.playPath.startsWith('http')) return trackInfo.playPath
          if (trackInfo.downloadUrl && trackInfo.downloadUrl.startsWith('http')) return trackInfo.downloadUrl
        }
      }
    } catch (e) {
      if (signal?.aborted) throw e
      console.warn('[ximalaya] mobile-playpage error', e)
    }

    // 2. Mobile album track stream (if albumId is known)
    const albumId = track.albumId || track.album_id
    if (albumId) {
      try {
        const res = await fetch(
          `https://mobile.ximalaya.com/mobile/v1/album/track/?albumId=${encodeURIComponent(albumId)}&device=android&isAsc=true&pageId=1&pageSize=50`,
          { signal },
        )
        if (res.ok) {
          const data = await res.json()
          const list = data?.data?.list || []
          const found = list.find((t) => String(t.trackId) === String(trackId))
          if (found) {
            const stream =
              found.playPathAacv224 ||
              found.playPathAacv164 ||
              found.playPath64 ||
              found.playPath32 ||
              found.downloadUrl
            if (stream && stream.startsWith('http')) return stream
          }
        }
      } catch (e) {
        if (signal?.aborted) throw e
        console.warn('[ximalaya] mobile album resolve error', e)
      }
    }

    // 3. Revision play APIs
    try {
      const res = await fetch(
        `https://www.ximalaya.com/revision/play/v1/audio?id=${encodeURIComponent(trackId)}&ptype=1`,
        { credentials: 'include', signal },
      )
      if (res.ok) {
        const data = await res.json()
        const src = data?.data?.src || data?.src
        if (src && src.startsWith('http')) return src
      }
    } catch {}

    try {
      const res = await fetch(`https://www.ximalaya.com/revision/play/v1/show?id=${encodeURIComponent(trackId)}`, {
        credentials: 'include',
        signal,
      })
      if (res.ok) {
        const data = await res.json()
        const src = data?.data?.src || data?.src
        if (src && src.startsWith('http')) return src
      }
    } catch {}

    return null
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
        if (!streamUrl || (hasRealId && /archive.org|audiofreehighqps/.test(streamUrl)))
          streamUrl = await resolveAudioUrl(track, signal)
        if (!valid(seq, track)) return
        if (!streamUrl) streamUrl = getFallbackUrl(track)
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
    if (action === 'play') {
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
      } else if (question.ask === 'search') {
        const res = await fetch(
          `https://www.ximalaya.com/revision/search/main?core=all&spellchecker=true&device=iPhone&kw=${encodeURIComponent(question.query)}&page=1&rows=30`,
          {
            credentials: 'include',
          },
        )
        const data = await res.json()
        const docs = data?.data?.track?.docs || data?.data?.result?.response?.docs || data?.data?.trackInfo?.docs || []
        const tracks = docs.map((t) => ({
          id: String(t.trackId || t.id),
          title: t.title || '声音片段',
          artist: t.nickname || t.anchorName || '喜马拉雅主播',
          album: t.albumTitle || '',
          albumId: t.albumId ? String(t.albumId) : undefined,
          artwork: toCoverUrl(t),
          duration: t.duration || 0,
        }))
        post({ type: 'answer', answer: { id, tracks } })
      } else if (question.ask === 'recommend' || question.ask === 'category') {
        const category = question.category || 'xiangsheng'
        let albums = []

        try {
          const res = await fetch(
            `https://www.ximalaya.com/revision/category/v2/albums?pageNum=1&pageSize=20&sort=1&category=${encodeURIComponent(category)}`,
            {
              credentials: 'include',
            },
          )
          if (res.ok) {
            const data = await res.json()
            const list = data?.data?.albums || data?.data?.albumList || []
            if (list.length > 0) {
              albums = list.map((a) => ({
                id: String(a.albumId || a.id),
                title: a.albumTitle || a.title || '有声专辑',
                artist: a.anchorName || a.nickname || '喜马拉雅主播',
                artwork: toCoverUrl(a),
                description: a.intro || a.description || '',
              }))
            }
          }
        } catch (e) {
          console.warn('[ximalaya] category fetch error', e)
        }

        if (albums.length === 0 && (question.ask === 'recommend' || category === 'featured')) {
          try {
            const rankRes = await fetch(
              `https://www.ximalaya.com/revision/rank/v2/element/rankingList?rankingId=1&pageSize=20`,
              { credentials: 'include' },
            )
            if (rankRes.ok) {
              const rankData = await rankRes.json()
              const list = rankData?.data?.albums || []
              if (list.length > 0) {
                albums = list.map((a) => ({
                  id: String(a.albumId || a.id),
                  title: a.albumTitle || a.title || '热门专辑',
                  artist: a.anchorName || a.nickname || '喜马拉雅主播',
                  artwork: toCoverUrl(a),
                  description: a.intro || '',
                }))
              }
            }
          } catch {}
        }

        post({ type: 'answer', answer: { id, albums } })
      } else if (question.ask === 'albumTracks') {
        let tracks = []

        try {
          const res = await fetch(
            `https://mobile.ximalaya.com/mobile/v1/album/track/?albumId=${encodeURIComponent(question.albumId)}&device=android&isAsc=true&pageId=1&pageSize=50`,
          )
          if (res.ok) {
            const data = await res.json()
            const list = data?.data?.list || []
            if (list.length > 0) {
              tracks = list.map((t, idx) => ({
                id: String(t.trackId),
                title: t.title || t.trackName || `第${idx + 1}集`,
                artist: t.nickname || t.anchorName || '喜马拉雅主播',
                duration: t.duration || 0,
                artwork: toCoverUrl(t),
                albumId: String(question.albumId),
                url:
                  t.playPathAacv224 || t.playPathAacv164 || t.playPath64 || t.playPath32 || t.downloadUrl || undefined,
              }))
            }
          }
        } catch (e) {
          console.warn('[ximalaya] mobile albumTracks error', e)
        }

        if (tracks.length === 0) {
          try {
            const res = await fetch(
              `https://www.ximalaya.com/revision/album/v1/getTracksList?albumId=${encodeURIComponent(question.albumId)}&pageNum=1&pageSize=50`,
              {
                credentials: 'include',
              },
            )
            if (res.ok) {
              const data = await res.json()
              const list = data?.data?.tracks || []
              tracks = list.map((t, idx) => ({
                id: String(t.trackId),
                title: t.title || `第${idx + 1}集`,
                artist: t.anchorName || '喜马拉雅主播',
                duration: t.duration || 0,
                artwork: toCoverUrl(t),
                albumId: String(question.albumId),
              }))
            }
          } catch (e) {
            console.warn('[ximalaya] revision albumTracks error', e)
          }
        }

        post({ type: 'answer', answer: { id, tracks } })
      }
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err) } })
    }
  }

  checkStatus()
  post({ type: 'ready' })
})()
