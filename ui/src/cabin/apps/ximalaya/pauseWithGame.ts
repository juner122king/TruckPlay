import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { playOrPause, pausePlayback, sendPlaybackVolume, sendVolume, skip, useXimalaya } from './ximalaya'

export const ximalayaPlayer: MusicPlayer = {
  name: 'ximalaya',
  playingHere: () => Boolean(useXimalaya.getState().playing),
  pendingHere: () => useXimalaya.getState().playback?.status === 'loading',
  hasMedia: () => Boolean(useXimalaya.getState().playback),
  trackTitle: () => {
    const p = useXimalaya.getState().playback
    if (!p) return null
    return p.owner === 'radio' ? p.artist || p.title || null : p.title || null
  },
  pauseHere: pausePlayback,
  resumeHere: () => {
    if (!useXimalaya.getState().playing) playOrPause()
  },
  volume: () => useXimalaya.getState().volume,
  sendVolume: (share) => sendPlaybackVolume(share),
  setVolume: (share) => sendVolume(share),
  skip: (direction) => skip(direction),
  subscribe: (changed) =>
    useXimalaya.subscribe((state, before) => {
      changed(Boolean(state.playing && !before.playing))
    }),
}

export function pauseXimalayaWithGame(): () => void {
  return pauseMusicWithGame(ximalayaPlayer)
}
