import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { isPlaybackPending, playOrPause, sendVolume, setVolume, skip, useQqmusic } from './qqmusic'

export const qqmusicPlayer: MusicPlayer = {
  name: 'qqmusic',
  pendingHere: () => isPlaybackPending(),
  playingHere: () => Boolean(useQqmusic.getState().playing),
  pauseHere: () => {
    if (useQqmusic.getState().playing || isPlaybackPending()) playOrPause()
  },
  resumeHere: () => {
    if (!useQqmusic.getState().playing) playOrPause()
  },
  volume: () => useQqmusic.getState().volume,
  sendVolume: (share) => sendVolume(share),
  setVolume: (share) => setVolume(share),
  skip: (direction) => skip(direction),
  subscribe: (changed) =>
    useQqmusic.subscribe((state, before) => {
      changed(Boolean(state.playing && !before.playing))
    }),
}

export function pauseQqmusicWithGame(): () => void {
  return pauseMusicWithGame(qqmusicPlayer)
}
