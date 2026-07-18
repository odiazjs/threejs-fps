import { and, eq } from 'drizzle-orm';
import { DEFAULT_OPERATOR_CHARACTER_ID } from '../../../shared/content/characters.js';
import { getDb } from '../db/index.js';
import { characters } from '../db/schema/characters.js';

const knownIds = new Set<string>();
const weaponDamageBonusById = new Map<string, number>();
let loaded = false;
let loadPromise: Promise<void> | null = null;

async function loadCatalog(): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({
      id: characters.id,
      perkKey: characters.perkKey,
      perkValue: characters.perkValue,
    })
    .from(characters)
    .where(eq(characters.enabled, true));

  knownIds.clear();
  weaponDamageBonusById.clear();

  for (const row of rows) {
    knownIds.add(row.id);
    const bonus =
      row.perkKey === 'weapon_damage_flat' ? Math.max(0, row.perkValue) : 0;
    weaponDamageBonusById.set(row.id, bonus);
  }

  if (!knownIds.has(DEFAULT_OPERATOR_CHARACTER_ID)) {
    knownIds.add(DEFAULT_OPERATOR_CHARACTER_ID);
    weaponDamageBonusById.set(DEFAULT_OPERATOR_CHARACTER_ID, 0);
  }

  loaded = true;
}

/** Ensure the in-memory character catalog (ids + perk bonuses) is loaded from DB. */
export async function ensureCharacterCatalogLoaded(): Promise<void> {
  if (loaded) return;
  if (!loadPromise) {
    loadPromise = loadCatalog().finally(() => {
      loadPromise = null;
    });
  }
  await loadPromise;
}

/** Force a reload (e.g. after admin catalog edits). */
export async function refreshCharacterCatalog(): Promise<void> {
  loaded = false;
  await ensureCharacterCatalogLoaded();
}

export function isKnownCharacterId(characterId: string): boolean {
  return knownIds.has(characterId);
}

export function getOperatorWeaponDamageBonus(characterId: string): number {
  return weaponDamageBonusById.get(characterId) ?? 0;
}

/** Async DB check used when the cache may be cold. */
export async function characterExistsInDb(characterId: string): Promise<boolean> {
  await ensureCharacterCatalogLoaded();
  if (knownIds.has(characterId)) return true;

  const db = getDb();
  const [row] = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.enabled, true)))
    .limit(1);

  if (row) {
    knownIds.add(row.id);
    return true;
  }
  return false;
}
