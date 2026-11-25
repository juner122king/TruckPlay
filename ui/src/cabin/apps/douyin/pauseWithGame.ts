import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { applyFadeVolume, pauseAutomatically, resumeAutomatically, sendVolume, skip, useDouyin } from './douyin'

export const douyinPlayer: MusicPlayer = {
  name: 'douyin',
  pendingHere: () => {
    const s = useDouyin.getState()
    return Boolean(s.buffering && !s.userPaused)
  },
  hasMedia: () => Boolean(useDouyin.getState().playback || useDouyin.getState().current),
  trackTitle: () => {
    const s = useDouyin.getState()
    return s.current?.title || s.playback?.title || null
  },
  playingHere: () => Boolean(useDouyin.getState().playing),
  pauseHere: () => pauseAutomatically(),
  resumeHere: () => resumeAutomatically(),
  volume: () => useDouyin.getState().volume,
  sendVolume: (share) => applyFadeVolume(share),
  setVolume: (share) => sendVolume(share),
  skip: (direction) => skip(direction),
  subscribe: (changed) =>
    useDouyin.subscribe((state, before) => {
      changed(Boolean(state.playing && !before.playing))
    }),
}

export function pauseDouyinWithGame(): () => void {
  return pauseMusicWithGame(douyinPlayer)
}
