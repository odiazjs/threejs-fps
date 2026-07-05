import type { GameLaunchMessage } from '../../../shared/network/gameInvite.js';

const pendingByUserId = new Map<string, GameLaunchMessage>();

export function setPendingGameLaunch(userId: string, launch: GameLaunchMessage): void {
  pendingByUserId.set(userId, launch);
}

export function consumePendingGameLaunch(userId: string): GameLaunchMessage | undefined {
  const launch = pendingByUserId.get(userId);
  if (!launch) return undefined;
  pendingByUserId.delete(userId);
  return launch;
}

export function peekPendingGameLaunch(userId: string): GameLaunchMessage | undefined {
  return pendingByUserId.get(userId);
}
