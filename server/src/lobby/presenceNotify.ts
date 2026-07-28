import type { Client } from 'colyseus';
import { eq } from 'drizzle-orm';
import type { FriendPresenceSnapshotMessage } from '../../../shared/network/friendPresence.js';
import { getDb } from '../db/index.js';
import { friendships } from '../db/schema/friendships.js';
import {
  buildPresenceUpdate,
  notifyLobbyUser,
  setPresenceChangeHandler,
} from './presence.js';
import { refreshPartyForUser } from './partyNotify.js';

async function getFriendIds(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ friendId: friendships.friendId })
    .from(friendships)
    .where(eq(friendships.userId, userId));
  return rows.map((row) => row.friendId);
}

async function getFriendWatchers(changedUserId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ userId: friendships.userId })
    .from(friendships)
    .where(eq(friendships.friendId, changedUserId));
  return rows.map((row) => row.userId);
}

export async function sendFriendPresenceSnapshot(
  client: Client,
  userId: string,
): Promise<void> {
  const friendIds = await getFriendIds(userId);
  const payload: FriendPresenceSnapshotMessage = {
    friends: friendIds.map((friendId) => buildPresenceUpdate(friendId)),
  };
  client.send('friendPresenceSnapshot', payload);
}

async function notifyFriendsOfPresenceChange(changedUserId: string): Promise<void> {
  const update = buildPresenceUpdate(changedUserId);
  const watchers = await getFriendWatchers(changedUserId);

  for (const watcherId of watchers) {
    // Notify any friend who still has a lobby socket (lobby / menus / in-game overlay).
    notifyLobbyUser(watcherId, 'friendPresence', update);
  }
}

export function initPresenceNotifications(): void {
  setPresenceChangeHandler((userId) => {
    void notifyFriendsOfPresenceChange(userId).catch((error) => {
      console.error('[presence] failed to notify friends', error);
    });
    // Keep party launch-ready state in sync as members return from matches.
    refreshPartyForUser(userId);
  });
}
