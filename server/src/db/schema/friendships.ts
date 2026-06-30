import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/** One row per direction — query `user_id = me` for a user's friend list. */
export const friendships = pgTable(
  'friendships',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    friendId: text('friend_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.friendId] })],
);
