import {
  FPS_COUNTDOWN_TICK_MESSAGE,
  FPS_GAME_START_MESSAGE,
  FPS_LEAVE_GAME_MESSAGE,
  getCountdownTickPlayer,
} from '../audio/CountdownTickPlayer';
import {
  MATCH_COUNTDOWN_TICK_AUDIO,
  MATCH_GAME_START_AUDIO,
} from '../content/audioConfig';
import { resumeLobbyMusic, stopLobbyMusic } from '../audio/initMenuAudio';
import { LoadingOverlay } from '../ui/LoadingOverlay';

let overlay: HTMLIFrameElement | null = null;
let messageBound = false;
const closedHandlers = new Set<() => void>();

function onWindowMessage(event: MessageEvent): void {
  if (event.origin !== window.location.origin) return;
  if (!overlay || event.source !== overlay.contentWindow) return;

  const type = (event.data as { type?: string } | null)?.type;
  if (type === FPS_COUNTDOWN_TICK_MESSAGE) {
    getCountdownTickPlayer().playTick();
    return;
  }

  if (type === FPS_GAME_START_MESSAGE) {
    getCountdownTickPlayer().playGameStart();
    return;
  }

  if (type === FPS_LEAVE_GAME_MESSAGE) {
    closeGameOverlay();
  }
}

function ensureMessageHandler(): void {
  if (messageBound) return;
  messageBound = true;
  window.addEventListener('message', onWindowMessage);
}

/** Runs when the game overlay is closed and the lobby is shown again. */
export function onGameOverlayClosed(handler: () => void): () => void {
  closedHandlers.add(handler);
  return () => {
    closedHandlers.delete(handler);
  };
}

export function closeGameOverlay(): void {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  document.body.style.overflow = '';
  LoadingOverlay.shared().reset();
  resumeLobbyMusic();
  for (const handler of closedHandlers) {
    handler();
  }
}

/**
 * Unlock countdown audio in the current user gesture, then run the match in a
 * fullscreen iframe so ticks can play without another click on the game page.
 */
export async function launchGameOverlay(): Promise<void> {
  const tickPlayer = getCountdownTickPlayer();
  await Promise.all([
    tickPlayer.preload('tick', MATCH_COUNTDOWN_TICK_AUDIO),
    tickPlayer.preload('gameStart', MATCH_GAME_START_AUDIO),
  ]);
  tickPlayer.unlock();
  stopLobbyMusic();

  closeGameOverlay();
  ensureMessageHandler();

  const iframe = document.createElement('iframe');
  iframe.src = '/game.html';
  iframe.title = 'Game';
  iframe.allow = 'autoplay; fullscreen; pointer-lock';
  iframe.style.cssText = [
    'position:fixed',
    'inset:0',
    'width:100%',
    'height:100%',
    'border:0',
    'margin:0',
    'padding:0',
    'z-index:100000',
    'background:#111',
  ].join(';');

  document.body.style.overflow = 'hidden';
  document.body.appendChild(iframe);
  overlay = iframe;

  // Game has its own loader inside the iframe — clear lobby spinner now.
  LoadingOverlay.shared().reset();
}
