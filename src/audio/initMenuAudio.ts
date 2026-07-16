import { bindUiSounds } from './bindUiSounds';
import { LoopingSoundService } from './LoopingSoundService';
import { UiSoundService } from './UiSoundService';
import {
  LOBBY_MUSIC_AUDIO,
  UI_CLICK_AUDIO,
  UI_HOVER_AUDIO,
} from '../content/audioConfig';
import {
  clampLobbyMusicVolume,
  getStoredLobbyMusicVolume,
  storeLobbyMusicVolume,
} from '../settings/lobbyMusicVolume';

const uiSounds = new UiSoundService();
const lobbyMusic = new LoopingSoundService();

let uiReady: Promise<void> | null = null;
let lobbyMusicReady: Promise<void> | null = null;
let lobbyMusicEnabled = true;
let cancelPendingAutostart: (() => void) | null = null;

function clearPendingAutostart(): void {
  cancelPendingAutostart?.();
  cancelPendingAutostart = null;
}

function bindLobbyMusicAutostart(): void {
  clearPendingAutostart();

  const start = (): void => {
    if (!lobbyMusicEnabled) return;
    lobbyMusic.unlock();
    lobbyMusic.setActive(true);
  };

  const onPointerDown = (): void => start();
  const onKeyDown = (): void => start();

  document.addEventListener('pointerdown', onPointerDown, { once: true });
  document.addEventListener('keydown', onKeyDown, { once: true });

  cancelPendingAutostart = () => {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('keydown', onKeyDown);
  };
}

export function initUiSounds(): Promise<void> {
  if (!uiReady) {
    uiReady = Promise.all([
      uiSounds.preloadHover(UI_HOVER_AUDIO),
      uiSounds.preloadClick(UI_CLICK_AUDIO),
    ]).then(() => {
      bindUiSounds(uiSounds);
    });
  }
  return uiReady;
}

export function initLobbyMusic(): Promise<void> {
  if (!lobbyMusicReady) {
    lobbyMusic.setVolume(getStoredLobbyMusicVolume());
    lobbyMusicReady = lobbyMusic.preload(LOBBY_MUSIC_AUDIO.src).then(() => {
      bindLobbyMusicAutostart();

      window.addEventListener('pagehide', () => {
        stopLobbyMusic();
      });
    });
  }
  return lobbyMusicReady;
}

export function stopLobbyMusic(): void {
  lobbyMusicEnabled = false;
  clearPendingAutostart();
  lobbyMusic.setActive(false);
}

export function resumeLobbyMusic(): void {
  lobbyMusicEnabled = true;
  if (!lobbyMusicReady) return;
  lobbyMusic.unlock();
  lobbyMusic.setActive(true);
  bindLobbyMusicAutostart();
}

export function setLobbyMusicVolume(volume: number): void {
  const clamped = storeLobbyMusicVolume(volume);
  lobbyMusic.setVolume(clamped);
}

export function getLobbyMusicVolume(): number {
  return clampLobbyMusicVolume(getStoredLobbyMusicVolume());
}
