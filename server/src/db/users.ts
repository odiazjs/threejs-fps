import { eq } from 'drizzle-orm';
import { displayNameFromEmail } from '../../../shared/auth/displayName.js';
import type { AuthContext } from '../auth/middleware.js';
import { getDb } from './index.js';
import { playerStats } from './schema/playerStats.js';
import { users } from './schema/users.js';

export async function ensureUser(auth: AuthContext): Promise<void> {
  if (!auth.email) {
    throw new Error('Profile sync required. Sign in again.');
  }

  const db = getDb();
  const displayName = auth.displayName ?? displayNameFromEmail(auth.email);
  const now = new Date();

  await db
    .insert(users)
    .values({
      id: auth.sub,
      email: auth.email,
      displayName,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: auth.email,
        displayName,
        updatedAt: now,
        lastSeenAt: now,
      },
    });

  await db
    .insert(playerStats)
    .values({ userId: auth.sub })
    .onConflictDoNothing();
}

export async function findUserByEmail(email: string) {
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  const [row] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  return row ?? null;
}

export async function findUserById(userId: string) {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}
