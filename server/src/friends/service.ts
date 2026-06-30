import { and, eq, or } from 'drizzle-orm';
import type {
  FriendRequestSummary,
  FriendRespondResponse,
  FriendSummary,
  FriendsListResponse,
} from '../../../shared/api/friends.js';
import type { FriendRequestMessage, FriendRequestResultMessage } from '../../../shared/network/friends.js';
import { buildPresenceUpdate, notifyLobbyUser } from '../lobby/presence.js';
import { ensureUser, findUserByEmail, findUserById } from '../db/users.js';
import type { AuthContext } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import { friendRequests } from '../db/schema/friendRequests.js';
import { friendships } from '../db/schema/friendships.js';
import { users } from '../db/schema/users.js';

const REQUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function toFriendSummary(row: {
  id: string;
  displayName: string;
  email: string;
}): FriendSummary {
  const presence = buildPresenceUpdate(row.id);
  return {
    userId: row.id,
    displayName: row.displayName,
    email: row.email,
    online: presence.online,
    presence: presence.presence,
  };
}

function toRequestSummary(
  request: typeof friendRequests.$inferSelect,
  fromUser: typeof users.$inferSelect,
  toUser: typeof users.$inferSelect,
): FriendRequestSummary {
  return {
    id: request.id,
    fromUserId: request.fromUserId,
    fromDisplayName: fromUser.displayName,
    fromEmail: fromUser.email,
    toUserId: request.toUserId,
    toDisplayName: toUser.displayName,
    toEmail: toUser.email,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
  };
}

async function areFriends(userId: string, friendId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ userId: friendships.userId })
    .from(friendships)
    .where(and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)))
    .limit(1);
  return Boolean(row);
}

async function loadUsersForRequest(request: typeof friendRequests.$inferSelect) {
  const fromUser = await findUserById(request.fromUserId);
  const toUser = await findUserById(request.toUserId);
  if (!fromUser || !toUser) {
    throw new Error('Friend request user not found');
  }
  return { fromUser, toUser };
}

export async function listFriends(auth: AuthContext): Promise<FriendsListResponse> {
  await ensureUser(auth);
  const db = getDb();
  const userId = auth.sub;

  const friendRows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.friendId))
    .where(eq(friendships.userId, userId));

  const requestRows = await db
    .select()
    .from(friendRequests)
    .where(
      or(eq(friendRequests.fromUserId, userId), eq(friendRequests.toUserId, userId)),
    );

  const incoming: FriendRequestSummary[] = [];
  const outgoing: FriendRequestSummary[] = [];

  for (const request of requestRows) {
    if (request.status !== 'pending') continue;
    const { fromUser, toUser } = await loadUsersForRequest(request);
    const summary = toRequestSummary(request, fromUser, toUser);
    if (request.toUserId === userId) {
      incoming.push(summary);
    } else {
      outgoing.push(summary);
    }
  }

  incoming.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  outgoing.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    friends: friendRows.map(toFriendSummary).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    incoming,
    outgoing,
  };
}

export async function sendFriendRequest(
  auth: AuthContext,
  email: string,
): Promise<FriendRequestSummary> {
  await ensureUser(auth);

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Enter a valid email address');
  }

  const target = await findUserByEmail(normalizedEmail);
  if (!target) {
    throw new Error('No account found with that email — they need to sign in at least once');
  }

  if (target.id === auth.sub) {
    throw new Error('You cannot add yourself');
  }

  if (await areFriends(auth.sub, target.id)) {
    throw new Error('Already friends');
  }

  const db = getDb();
  const [reversePending] = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.fromUserId, target.id),
        eq(friendRequests.toUserId, auth.sub),
        eq(friendRequests.status, 'pending'),
      ),
    )
    .limit(1);

  if (reversePending) {
    throw new Error('They already sent you a request — accept it from your notifications');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + REQUEST_TTL_MS);

  const [existing] = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.fromUserId, auth.sub),
        eq(friendRequests.toUserId, target.id),
      ),
    )
    .limit(1);

  let request: typeof friendRequests.$inferSelect;

  if (existing) {
    if (existing.status === 'pending') {
      throw new Error('Friend request already sent');
    }

    const [updated] = await db
      .update(friendRequests)
      .set({
        status: 'pending',
        createdAt: now,
        respondedAt: null,
        expiresAt,
      })
      .where(eq(friendRequests.id, existing.id))
      .returning();

    if (!updated) {
      throw new Error('Could not create friend request');
    }
    request = updated;
  } else {
    const [inserted] = await db
      .insert(friendRequests)
      .values({
        fromUserId: auth.sub,
        toUserId: target.id,
        status: 'pending',
        expiresAt,
      })
      .returning();

    if (!inserted) {
      throw new Error('Could not create friend request');
    }
    request = inserted;
  }

  const fromUser = await findUserById(auth.sub);
  if (!fromUser) {
    throw new Error('Your profile is not ready yet');
  }

  const summary = toRequestSummary(request, fromUser, target);

  const payload: FriendRequestMessage = {
    requestId: request.id,
    fromUserId: fromUser.id,
    fromUsername: fromUser.displayName,
  };
  notifyLobbyUser(target.id, 'friendRequest', payload);

  return summary;
}

export async function respondToFriendRequest(
  auth: AuthContext,
  requestId: string,
  accepted: boolean,
): Promise<FriendRespondResponse> {
  await ensureUser(auth);
  const db = getDb();

  const [request] = await db
    .select()
    .from(friendRequests)
    .where(eq(friendRequests.id, requestId))
    .limit(1);

  if (!request) {
    throw new Error('Friend request not found');
  }

  if (request.toUserId !== auth.sub) {
    throw new Error('Not authorized to respond to this request');
  }

  if (request.status !== 'pending') {
    throw new Error('Friend request is no longer pending');
  }

  const { fromUser, toUser } = await loadUsersForRequest(request);
  const now = new Date();

  if (!accepted) {
    const [updated] = await db
      .update(friendRequests)
      .set({ status: 'declined', respondedAt: now })
      .where(eq(friendRequests.id, requestId))
      .returning();

    const summary = toRequestSummary(updated ?? request, fromUser, toUser);

    const result: FriendRequestResultMessage = {
      requestId: request.id,
      username: toUser.displayName,
      accepted: false,
    };
    notifyLobbyUser(fromUser.id, 'friendRequestResult', result);

    return { request: summary };
  }

  if (await areFriends(fromUser.id, toUser.id)) {
    throw new Error('Already friends');
  }

  await db.transaction(async (tx) => {
    await tx
      .update(friendRequests)
      .set({ status: 'accepted', respondedAt: now })
      .where(eq(friendRequests.id, requestId));

    await tx.insert(friendships).values([
      { userId: fromUser.id, friendId: toUser.id },
      { userId: toUser.id, friendId: fromUser.id },
    ]);
  });

  const summary = toRequestSummary(
    { ...request, status: 'accepted', respondedAt: now },
    fromUser,
    toUser,
  );

  const friend = toFriendSummary(fromUser);

  const toResult: FriendRequestResultMessage = {
    requestId: request.id,
    username: fromUser.displayName,
    accepted: true,
  };
  notifyLobbyUser(toUser.id, 'friendRequestResult', toResult);

  const fromResult: FriendRequestResultMessage = {
    requestId: request.id,
    username: toUser.displayName,
    accepted: true,
  };
  notifyLobbyUser(fromUser.id, 'friendRequestResult', fromResult);

  return {
    request: summary,
    friendship: { friend },
  };
}

export async function removeFriend(auth: AuthContext, friendUserId: string): Promise<void> {
  await ensureUser(auth);

  if (friendUserId === auth.sub) {
    throw new Error('Invalid friend');
  }

  const db = getDb();

  await db.transaction(async (tx) => {
    await tx
      .delete(friendships)
      .where(
        and(
          eq(friendships.userId, auth.sub),
          eq(friendships.friendId, friendUserId),
        ),
      );

    await tx
      .delete(friendships)
      .where(
        and(
          eq(friendships.userId, friendUserId),
          eq(friendships.friendId, auth.sub),
        ),
      );
  });
}
