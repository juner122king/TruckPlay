// WestPlay: Player's own player (music_folder.rs), in a WebView of its own under the cabin page: the
// songs of the game's music folder and videos of its videos folder (streamed over loopback HTTP with Range
// support), played by one <video> element, its sound through the truck's own speakers (cab_sound.js, loaded
// first). The cab's Player app says what to play; this says what plays.
;(() => {
  if (location.hostname !== '127.0.0.1' || !location.pathname.endsWith('/player.html')) return
  const base = location.pathname.slice(0, -'/player.html'.length)
  const post = (message) => window.chrome?.webview?.postMessage(message)

  const media = document.createElement('video')
  media.preload = 'metadata'
  media.playsInline = true
  // Its sound taken into the page's own sound processing (the speakers).
  media.crossOrigin = 'anonymous'

  const mount = () => {
    if (document.body && !media.isConnected) {
      document.body.appendChild(media)
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
  } else {
    mount()
  }

  const url = (file, kind) => `${base}/${kind === 'video' ? 'videos' : 'music'}/${encodeURIComponent(file)}`

  // The queue as asked (the folder's order), the order it plays in (shuffled or not), its kind, and index.
  let asked = []
  let queue = []
  let mediaKind = 'audio'
  let index = -1
  let shuffle = false
  let repeat = 'off'
  let rate = 1
  let ended = false
  let errorCode = null
  let poster = null
  let posterFor = null
  let consecutiveAudioErrors = 0

  const shuffled = (files) => {
    const out = [...files]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
  const current = () => queue[index] ?? null

  const capturePoster = () => {
    const file = current()
    if (mediaKind !== 'video' || !file || posterFor === file) return
    const vw = media.videoWidth
    const vh = media.videoHeight
    if (!vw || !vh) return
    try {
      const maxWidth = 320
      const scale = Math.min(1, maxWidth / vw)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(vw * scale))
      canvas.height = Math.max(1, Math.round(vh * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(media, 0, 0, canvas.width, canvas.height)
      poster = canvas.toDataURL('image/jpeg', 0.72)
      posterFor = file
    } catch {
      // Ignore poster capture failures; playback continues unaffected.
    }
  }

  // What plays: file, kind, playing/loading/ended, position, duration, options, volume, speed, dimensions, error.
  let told = 'null'
  const tell = () => {
    const file = current()
    const playback = file && {
      file,
      kind: mediaKind,
      playing: !media.paused && !media.ended && !errorCode,
      loading: !media.paused && !errorCode && media.readyState < 3,
      ended: Boolean(ended || media.ended),
      position: Number(media.currentTime) || 0,
      duration: Number.isFinite(media.duration) ? media.duration : 0,
      shuffle,
      repeat,
      volume: media.volume,
      rate,
      index,
      count: queue.length,
      ...(mediaKind === 'video' && media.videoWidth > 0
        ? { videoWidth: media.videoWidth, videoHeight: media.videoHeight }
        : {}),
      ...(errorCode ? { error: errorCode } : {}),
      ...(poster ? { poster } : {}),
    }
    const now = JSON.stringify(playback ?? null)
    if (now === told) return
    told = now
    post({ playback: playback ?? null })
  }

  const load = (at, shouldPlay) => {
    mount()
    index = at
    ended = false
    errorCode = null
    poster = null
    posterFor = null
    const file = current()
    if (!file) {
      media.pause()
      media.removeAttribute('src')
      media.load()
      tell()
      return
    }
    media.src = url(file, mediaKind)
    media.playbackRate = rate
    if (shouldPlay) media.play().catch(() => tell())
    tell()
  }

  // Next (1) or back (-1); past the last: the first again with Repeat All, else stopped/ended.
  const skip = (by, shouldPlay = !media.paused) => {
    if (queue.length === 0) return
    const next = index + by
    if (next >= queue.length) {
      if (repeat === 'all') return load(0, shouldPlay)
      media.pause()
      if (mediaKind === 'video') {
        ended = true
      } else {
        media.currentTime = 0
        ended = false
      }
      return tell()
    }
    load(Math.max(0, next), shouldPlay)
  }

  const CONTROLS = {
    // The media files (file names, in the folder's order) from `index`, shuffled or not; with none, play on.
    play({ files, index: at, shuffle: on, kind }) {
      if (!Array.isArray(files)) {
        if (current()) {
          if (ended || media.ended) {
            media.currentTime = 0
            ended = false
          }
          errorCode = null
          media.playbackRate = rate
          media.play().catch(() => tell())
          tell()
        }
        return
      }
      asked = files.filter((file) => typeof file === 'string')
      if (asked.length === 0) {
        CONTROLS.stop()
        return
      }
      mediaKind = kind === 'video' ? 'video' : 'audio'
      consecutiveAudioErrors = 0
      if (mediaKind === 'audio') {
        rate = 1
        media.playbackRate = 1
      }
      shuffle = Boolean(on)
      const first = shuffle && at == null ? asked[Math.floor(Math.random() * asked.length)] : asked[at ?? 0]
      queue = shuffle ? [first, ...shuffled(asked.filter((file) => file !== first))] : asked
      load(Math.max(0, queue.indexOf(first)), true)
    },
    pause: () => {
      media.pause()
      tell()
    },
    stop: () => {
      asked = []
      queue = []
      index = -1
      ended = false
      errorCode = null
      poster = null
      posterFor = null
      media.pause()
      media.removeAttribute('src')
      media.load()
      told = 'null'
      post({ playback: null })
    },
    next: () => {
      consecutiveAudioErrors = 0
      skip(1, true)
    },
    // Back: past a track's first 3 seconds, return to start.
    previous() {
      consecutiveAudioErrors = 0
      if (media.currentTime > 3 || index <= 0) {
        media.currentTime = 0
        ended = false
        tell()
      } else {
        skip(-1, true)
      }
    },
    seek({ seconds }) {
      if (Number.isFinite(seconds)) {
        media.currentTime = Math.max(0, seconds)
        ended = false
      }
      tell()
    },
    volume({ percent }) {
      if (Number.isFinite(percent)) media.volume = Math.min(1, Math.max(0, percent / 100))
    },
    rate({ rate: nextRate }) {
      if (Number.isFinite(nextRate) && nextRate >= 0.25 && nextRate <= 4) {
        rate = nextRate
        media.playbackRate = rate
        tell()
      }
    },
    crop({ on }) {
      media.classList.toggle('crop', Boolean(on))
    },
    shuffle({ on }) {
      const file = current()
      shuffle = Boolean(on)
      queue = shuffle ? [file, ...shuffled(asked.filter((each) => each !== file))].filter(Boolean) : asked
      index = file ? queue.indexOf(file) : -1
      tell()
    },
    repeat({ mode }) {
      repeat = ['off', 'all', 'one'].includes(mode) ? mode : 'off'
      tell()
    },
  }

  media.addEventListener('ended', () => {
    if (repeat === 'one') {
      ended = false
      media.currentTime = 0
      media.play().catch(() => tell())
      tell()
    } else if (index + 1 < queue.length || repeat === 'all') {
      skip(1, true)
    } else {
      ended = true
      tell()
    }
  })

  media.addEventListener('error', () => {
    if (!current()) return
    const code = media.error?.code
    const reason =
      code === 4
        ? 'unsupported'
        : code === 3
          ? 'decode'
          : code === 2
            ? 'network'
            : 'playback'
    if (mediaKind === 'audio' && current() && queue.length > 1 && consecutiveAudioErrors < queue.length) {
      consecutiveAudioErrors += 1
      skip(1, true)
      return
    }
    errorCode = reason
    media.pause()
    tell()
  })

  media.addEventListener('playing', () => {
    consecutiveAudioErrors = 0
    ended = false
    errorCode = null
    tell()
  })

  media.addEventListener('loadeddata', () => {
    capturePoster()
    tell()
  })

  for (const name of ['play', 'pause', 'waiting', 'canplay', 'loadedmetadata', 'durationchange', 'seeked', 'volumechange', 'ratechange']) {
    media.addEventListener(name, tell)
  }

  // The truck's own speakers (cab_sound.js): this page's media element, told the speakers, the head, the
  // camera and the tone by the host.
  const cab = window.westplayCabSound?.(() => media, post)
  if (cab) setInterval(() => cab.tick(), 250)
  const CAB = {
    speakers: (data) => cab?.speakers(data.speakers),
    head: (data) => cab?.head(data),
    outside: (data) => cab?.outside(data.on, data.distance),
    equalizer: (data) => cab?.equalizer(data),
    spectrum: (data) => cab?.spectrum(data.on),
  }
  window.chrome?.webview?.addEventListener('message', ({ data }) => {
    if (CAB[data?.action]) CAB[data.action](data)
    else CONTROLS[data?.action]?.(data)
  })

  // Ready (a page loaded anew: the host replays cab sound and any commands queued during startup).
  post({ ready: true })
})()
