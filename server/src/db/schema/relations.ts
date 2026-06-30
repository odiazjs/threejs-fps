import { relations } from 'drizzle-orm';
import { friendRequests } from './friendRequests.js';
import { friendships } from './friendships.js';
import { playerStats } from './playerStats.js';
import { users } from './users.js';

export const usersRelations = relations(users, ({ one, many }) => ({
  stats: one(playerStats, {
    fields: [users.id],
    references: [playerStats.userId],
  }),
  friendships: many(friendships, { relationName: 'userFriendships' }),
  friendsOf: many(friendships, { relationName: 'friendOf' }),
  sentFriendRequests: many(friendRequests, { relationName: 'sentRequests' }),
  receivedFriendRequests: many(friendRequests, { relationName: 'receivedRequests' }),
}));

export const playerStatsRelations = relations(playerStats, ({ one }) => ({
  user: one(users, {
    fields: [playerStats.userId],
    references: [users.id],
  }),
}));

export const friendshipsRelations = relations(friendships, ({ one }) => ({
  user: one(users, {
    fields: [friendships.userId],
    references: [users.id],
    relationName: 'userFriendships',
  }),
  friend: one(users, {
    fields: [friendships.friendId],
    references: [users.id],
    relationName: 'friendOf',
  }),
}));

export const friendRequestsRelations = relations(friendRequests, ({ one }) => ({
  fromUser: one(users, {
    fields: [friendRequests.fromUserId],
    references: [users.id],
    relationName: 'sentRequests',
  }),
  toUser: one(users, {
    fields: [friendRequests.toUserId],
    references: [users.id],
    relationName: 'receivedRequests',
  }),
}));
