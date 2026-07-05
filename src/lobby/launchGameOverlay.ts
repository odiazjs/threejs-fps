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
import type { GameJoinIntent } from '../auth/gameJoin';
import { buildGameUrl } from '../debug/debugQuery';
import {
  FPS_JOIN_INTENT_MESSAGE,
  FPS_REQUEST_JOIN_INTENT_MESSAGE,
  type GameJoinIntentResponseMessage,
} from '../../shared/network/gameOverlayMessages';

let overlay: HTMLIFrameElement | null = null;
let pendingJoinIntent: GameJoinIntent | null = null;
let messageBound = false;
const closedHandlers = new Set<() => void>();
let pauseBackgroundScene: (() => void) | null = null;
let resumeBackgroundScene: (() => void) | null = null;

/** Pause lobby WebGL while the game iframe runs (avoids dual rAF + GPU contention). */
export function setGameOverlayBackgroundHooks(
  pause: () => void,
  resume: () => void,
): void {
  pauseBackgroundScene = pause;
  resumeBackgroundScene = resume;
}

function takePendingJoinIntent(): GameJoinIntent | null {
  const intent = pendingJoinIntent;
  pendingJoinIntent = null;
  return intent;
}

function clearPendingJoinIntent(): void {
  pendingJoinIntent = null;
}

function onWindowMessage(event: MessageEvent): void {
  if (event.origin !== window.location.origin) return;
  if (!overlay || event.source !== overlay.contentWindow) return;

  const type = (event.data as { type?: string } | null)?.type;

  if (type === FPS_REQUEST_JOIN_INTENT_MESSAGE) {
    const response: GameJoinIntentResponseMessage = {
      type: FPS_JOIN_INTENT_MESSAGE,
      intent: takePendingJoinIntent(),
    };
    overlay.contentWindow?.postMessage(response, window.location.origin);
    return;
  }

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
  clearPendingJoinIntent();
  document.body.style.overflow = '';
  LoadingOverlay.shared().reset();
  resumeLobbyMusic();
  resumeBackgroundScene?.();
  for (const handler of closedHandlers) {
    handler();
  }
}

/**
 * Unlock countdown audio in the current user gesture, then run the match in a
 * fullscreen iframe so ticks can play without another click on the game page.
 */
export async function launchGameOverlay(joinIntent?: GameJoinIntent | null): Promise<void> {
  const tickPlayer = getCountdownTickPlayer();
  await Promise.all([
    tickPlayer.preload('tick', MATCH_COUNTDOWN_TICK_AUDIO),
    tickPlayer.preload('gameStart', MATCH_GAME_START_AUDIO),
  ]);
  tickPlayer.unlock();
  stopLobbyMusic();
  pauseBackgroundScene?.();

  closeGameOverlay();
  ensureMessageHandler();
  pendingJoinIntent = joinIntent ?? null;

  const iframe = document.createElement('iframe');
  iframe.src = buildGameUrl('/game.html');
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
