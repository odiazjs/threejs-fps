import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { friendRequestStatusEnum } from './enums.js';
import { users } from './users.js';

export const friendRequests = pgTable(
  'friend_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendRequestStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('friend_requests_pair_uidx').on(table.fromUserId, table.toUserId),
  ],
);
