import type { PlayerSong } from '../../../shared/host'

/**
 * Made-up songs and videos for Player in a plain browser (no host to list the game's folders: the cab's preview).
 * Every name here is invented; some have no tags, as files in the folder may not.
 */
export const SONGS: PlayerSong[] = [
  { file: 'Long Road North.mp3', kind: 'audio', title: 'Long Road North', artist: 'The Milemarkers', seconds: 240 },
  { file: 'Diesel and Rain.mp3', kind: 'audio', title: 'Diesel and Rain', artist: 'The Milemarkers', seconds: 228 },
  { file: 'Border Lights.mp3', kind: 'audio', title: 'Border Lights', artist: 'The Milemarkers', seconds: 262 },
  { file: 'Night Drive.ogg', kind: 'audio', title: 'Night Drive', artist: 'Kaleo Sands', seconds: 252 },
  { file: 'Harbour at Two.ogg', kind: 'audio', title: 'Harbour at Two', artist: 'Kaleo Sands', seconds: 301 },
  { file: 'track07_final.mp3', kind: 'audio', seconds: 301 },
  { file: 'Windscreen.mp3', kind: 'audio', title: 'Windscreen', artist: 'Grey Lantern', seconds: 214 },
  { file: 'Mirage.mp3', kind: 'audio', title: 'Mirage', artist: 'Sol Avenue', seconds: 276 },
  { file: 'Timberline.mp3', kind: 'audio', title: 'Timberline', artist: 'North Pines', seconds: 245 },
  { file: 'weigh station (live).mp3', kind: 'audio', seconds: 208 },
]

export const VIDEOS: PlayerSong[] = [
  { file: 'Alpine Pass Timelapse.mp4', kind: 'video', title: 'Alpine Pass Timelapse', seconds: 325 },
  { file: 'Night Highway Rain.webm', kind: 'video', seconds: 192 },
  { file: 'Ferry Crossing 4K.mp4', kind: 'video', title: 'Ferry Crossing', seconds: 488 },
]
