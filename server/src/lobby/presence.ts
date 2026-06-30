import type { FriendPresenceStatus, FriendPresenceUpdate } from '../../../shared/network/friendPresence.js';

type LobbyClient = {
  send: (type: string, data: unknown) => void;
};

type ActivePresenceStatus = 'lobby' | 'game';

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
  return presenceByUserId.get(userId)?.status === 'lobby';
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

export function registerGameUser(userId: string): void {
  presenceByUserId.set(userId, { status: 'game' });
  emitPresenceChange(userId);
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
