import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { playOrPause, pausePlayback, sendPlaybackVolume, sendVolume, skip, useXimalaya } from './ximalaya'

export const ximalayaPlayer: MusicPlayer = {
  name: 'ximalaya',
  playingHere: () => Boolean(useXimalaya.getState().playing),
  pendingHere: () => useXimalaya.getState().playback?.status === 'loading',
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
