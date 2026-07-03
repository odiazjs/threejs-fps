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
      const start = (): void => {
        lobbyMusic.unlock();
        lobbyMusic.setActive(true);
      };

      document.addEventListener('pointerdown', start, { once: true });
      document.addEventListener('keydown', start, { once: true });

      window.addEventListener('pagehide', () => {
        lobbyMusic.stop();
      });
    });
  }
  return lobbyMusicReady;
}

export function stopLobbyMusic(): void {
  lobbyMusic.stop();
}

export function resumeLobbyMusic(): void {
  if (!lobbyMusicReady) return;
  lobbyMusic.unlock();
  lobbyMusic.setActive(true);
}

export function setLobbyMusicVolume(volume: number): void {
  const clamped = storeLobbyMusicVolume(volume);
  lobbyMusic.setVolume(clamped);
}

export function getLobbyMusicVolume(): number {
  return clampLobbyMusicVolume(getStoredLobbyMusicVolume());
}
