import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/** Cognito `sub` is the primary key. */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: varchar('display_name', { length: 16 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});
