/**
 * Bridge from HTTP store/loadout mutations → LobbyRoom party broadcast.
 * LobbyRoom registers the handler in onCreate / clears it in onDispose.
 */

let refreshPartyHandler: ((userId: string) => void) | null = null;

export function setRefreshPartyHandler(handler: ((userId: string) => void) | null): void {
  refreshPartyHandler = handler;
}

/** Push a fresh party snapshot to every member of this user's party (if any). */
export function refreshPartyForUser(userId: string): void {
  refreshPartyHandler?.(userId);
}
