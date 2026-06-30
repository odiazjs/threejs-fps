type LobbyClient = {
  send: (type: string, data: unknown) => void;
};

const onlineByUserId = new Map<string, LobbyClient>();

export function registerLobbyUser(userId: string, client: LobbyClient): void {
  onlineByUserId.set(userId, client);
}

export function unregisterLobbyUser(userId: string): void {
  onlineByUserId.delete(userId);
}

export function notifyLobbyUser(userId: string, type: string, data: unknown): boolean {
  const client = onlineByUserId.get(userId);
  if (!client) return false;
  client.send(type, data);
  return true;
}

export function isUserOnlineInLobby(userId: string): boolean {
  return onlineByUserId.has(userId);
}
