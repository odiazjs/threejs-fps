import { Client, type Room } from '@colyseus/sdk';
import type { GameLaunchMessage } from '../../shared/network/gameInvite';
import { LobbyState } from '../../shared/schema/LobbyState';
import { SERVER_URL } from '../config/serverUrl';
import type { FpsJoinCredentials } from './joinCredentials';
import type { GameJoinIntent } from './gameJoin';
import { normalizeGameMode } from '../../shared/combat/match';
import { normalizeMapId } from '../../shared/level/maps';

const LOBBY_LAUNCH_TIMEOUT_MS = 8_000;

function launchToIntent(data: GameLaunchMessage): GameJoinIntent {
  return {
    mode: 'join',
    roomId: data.roomId,
    mapId: normalizeMapId(data.mapId),
    gameMode: normalizeGameMode(data.gameMode),
    ...(typeof data.teamId === 'number' ? { teamId: data.teamId } : {}),
  };
}

/**
 * Brief lobby connection to consume the server-side pending party launch.
 * Authoritative source for roomId — not URL params or parent window state.
 */
export async function fetchPartyGameLaunch(
  credentials: FpsJoinCredentials,
): Promise<GameJoinIntent | null> {
  const client = new Client(SERVER_URL);
  let room: Room | null = null;

  try {
    room = await client.joinOrCreate(
      'lobby',
      { userId: credentials.userId, username: credentials.username },
      LobbyState,
    );

    return await new Promise<GameJoinIntent | null>((resolve) => {
      let settled = false;

      const finish = (intent: GameJoinIntent | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(intent);
      };

      room!.onMessage('gameLaunch', (data: GameLaunchMessage) => {
        finish(launchToIntent(data));
      });

      room!.onMessage('gameLaunchNone', () => {
        finish(null);
      });

      const timeoutId = window.setTimeout(() => finish(null), LOBBY_LAUNCH_TIMEOUT_MS);
      room!.send('requestGameLaunch', {});
    });
  } finally {
    if (room) {
      await Promise.race([
        room.leave(true),
        new Promise<void>((resolve) => window.setTimeout(resolve, 1500)),
      ]);
    }
  }
}
