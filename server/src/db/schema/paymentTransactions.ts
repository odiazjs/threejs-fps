import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/** Real-money plasma pack purchases (Lemon Squeezy). */
export const paymentTransactions = pgTable('payment_transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  packId: text('pack_id').notNull(),
  amountGranted: integer('amount_granted').notNull(),
  /** Lemon Squeezy order id — unique for exactly-once wallet credit. */
  lemonOrderId: text('lemon_order_id').notNull().unique(),
  lemonVariantId: text('lemon_variant_id').notNull(),
  status: text('status').notNull().default('completed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
