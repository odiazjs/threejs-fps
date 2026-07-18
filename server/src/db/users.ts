import { eq, sql } from 'drizzle-orm';
import { displayNameFromEmail } from '../../../shared/auth/displayName.js';
import { PLASMA_MINERALS_STARTING_BALANCE } from '../../../shared/content/weaponUpgrades.js';
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
      plasmaMinerals: PLASMA_MINERALS_STARTING_BALANCE,
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

  const { ensureUserCharacter } = await import('../characters/userCharacter.js');
  await ensureUserCharacter(auth.sub);
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

export async function getPlasmaMinerals(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ plasmaMinerals: users.plasmaMinerals })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.plasmaMinerals ?? 0;
}

/** Credit plasma minerals (store purchase / grants). Returns new balance. */
export async function addPlasmaMinerals(userId: string, amount: number): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid plasma mineral amount');
  }
  const grant = Math.floor(amount);
  const db = getDb();
  const [row] = await db
    .update(users)
    .set({
      plasmaMinerals: sql`${users.plasmaMinerals} + ${grant}`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ plasmaMinerals: users.plasmaMinerals });

  if (!row) {
    throw new Error('User not found');
  }
  return row.plasmaMinerals;
}
