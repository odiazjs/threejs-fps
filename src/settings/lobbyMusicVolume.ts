import { LOBBY_MUSIC_AUDIO } from '../content/audioConfig';

const STORAGE_KEY = 'lobby-music-volume';

export function getDefaultLobbyMusicVolume(): number {
  return LOBBY_MUSIC_AUDIO.volume;
}

export function clampLobbyMusicVolume(volume: number): number {
  if (!Number.isFinite(volume)) return getDefaultLobbyMusicVolume();
  return Math.max(0, Math.min(1, volume));
}

export function getStoredLobbyMusicVolume(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return getDefaultLobbyMusicVolume();
  return clampLobbyMusicVolume(Number(raw));
}

export function storeLobbyMusicVolume(volume: number): number {
  const clamped = clampLobbyMusicVolume(volume);
  localStorage.setItem(STORAGE_KEY, String(clamped));
  return clamped;
}

export function lobbyMusicVolumePercent(volume: number): number {
  return Math.round(clampLobbyMusicVolume(volume) * 100);
}
