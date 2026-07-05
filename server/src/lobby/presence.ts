import type { FriendPresenceStatus, FriendPresenceUpdate } from '../../../shared/network/friendPresence.js';

type LobbyClient = {
  send: (type: string, data: unknown) => void;
};

type ActivePresenceStatus = 'lobby' | 'menus' | 'game';

interface PresenceEntry {
  status: ActivePresenceStatus;
  lobbyClient?: LobbyClient;
}

const presenceByUserId = new Map<string, PresenceEntry>();

let presenceChangeHandler: ((userId: string) => void) | null = null;

export function setPresenceChangeHandler(handler: (userId: string) => void): void {
  presenceChangeHandler = handler;
}

function emitPresenceChange(userId: string): void {
  presenceChangeHandler?.(userId);
}

export function getPublicPresence(userId: string): FriendPresenceStatus {
  return presenceByUserId.get(userId)?.status ?? 'offline';
}

export function isUserOnline(userId: string): boolean {
  return presenceByUserId.has(userId);
}

export function isUserInLobby(userId: string): boolean {
  const status = presenceByUserId.get(userId)?.status;
  return status === 'lobby' || status === 'menus';
}

export function buildPresenceUpdate(userId: string): FriendPresenceUpdate {
  const presence = getPublicPresence(userId);
  return {
    userId,
    online: presence !== 'offline',
    presence,
  };
}

export function registerLobbyUser(userId: string, client: LobbyClient): void {
  presenceByUserId.set(userId, { status: 'lobby', lobbyClient: client });
  emitPresenceChange(userId);
}

export function setLobbyAppView(
  userId: string,
  view: 'lobby' | 'menus',
  client?: LobbyClient,
): void {
  const entry = presenceByUserId.get(userId);
  const lobbyClient = client ?? entry?.lobbyClient;
  if (!lobbyClient) return;

  const statusChanged = !entry || entry.status !== view;
  presenceByUserId.set(userId, { status: view, lobbyClient });

  if (statusChanged) {
    emitPresenceChange(userId);
  }
}

export function registerGameUser(userId: string): void {
  const existing = presenceByUserId.get(userId);
  const statusChanged = existing?.status !== 'game';
  presenceByUserId.set(userId, {
    status: 'game',
    lobbyClient: existing?.lobbyClient,
  });
  if (statusChanged) {
    emitPresenceChange(userId);
  }
}

/** Restore lobby/menus presence when leaving a match while the lobby tab stays open. */
export function restoreLobbyPresenceAfterGame(
  userId: string,
  view: 'lobby' | 'menus' = 'lobby',
): void {
  const existing = presenceByUserId.get(userId);
  if (existing?.lobbyClient) {
    const statusChanged = existing.status !== view;
    presenceByUserId.set(userId, { status: view, lobbyClient: existing.lobbyClient });
    if (statusChanged) {
      emitPresenceChange(userId);
    }
    return;
  }

  if (presenceByUserId.delete(userId)) {
    emitPresenceChange(userId);
  }
}

export function unregisterUser(userId: string): void {
  if (!presenceByUserId.delete(userId)) return;
  emitPresenceChange(userId);
}

export function notifyLobbyUser(userId: string, type: string, data: unknown): boolean {
  const entry = presenceByUserId.get(userId);
  if (!entry?.lobbyClient) return false;
  entry.lobbyClient.send(type, data);
  return true;
}
