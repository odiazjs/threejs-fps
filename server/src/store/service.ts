import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  PurchaseStoreItemResponse,
  SelectStoreItemResponse,
  SellStoreItemResponse,
  StoreItemState,
  StoreItemsResponse,
} from '../../../shared/api/store.js';
import { storeSellBackRefund } from '../../../shared/content/storeEconomy.js';
import {
  DEFAULT_CHARACTER_ITEM_ID,
  isEquipableCharacterType,
} from '../../../shared/content/storeItemTypes.js';
import type { AuthContext } from '../auth/middleware.js';
import { ensureUser } from '../db/users.js';
import { getDb } from '../db/index.js';
import { storeItems, userStoreUnlocks } from '../db/schema/storeItems.js';
import { users } from '../db/schema/users.js';
import { refreshPartyForUser } from '../lobby/partyNotify.js';

type StoreItemRow = typeof storeItems.$inferSelect;

function buildItemStates(
  catalog: readonly StoreItemRow[],
  unlockedIds: ReadonlySet<string>,
  selectedCharacterId: string,
): StoreItemState[] {
  return catalog.map((entry) => {
    const unlocked = entry.defaultUnlocked || unlockedIds.has(entry.id);
    const selected =
      isEquipableCharacterType(entry.type) && entry.id === selectedCharacterId;
    const sellable = unlocked && !entry.defaultUnlocked && entry.cost > 0;
    return {
      id: entry.id,
      type: entry.type,
      name: entry.name,
      description: entry.description,
      cost: entry.cost,
      unlocked,
      selected,
      sellable,
      sellRefund: sellable ? storeSellBackRefund(entry.cost) : 0,
      assetFile: entry.assetFile,
    };
  });
}

async function readCatalog(): Promise<StoreItemRow[]> {
  const db = getDb();
  return db
    .select()
    .from(storeItems)
    .where(eq(storeItems.enabled, true))
    .orderBy(asc(storeItems.sortOrder), asc(storeItems.name));
}

async function readUnlockedIds(userId: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ itemId: userStoreUnlocks.itemId })
    .from(userStoreUnlocks)
    .where(eq(userStoreUnlocks.userId, userId));
  return new Set(rows.map((row) => row.itemId));
}

async function resolveSelectedCharacterId(
  raw: string | null | undefined,
  catalog: readonly StoreItemRow[],
): Promise<string> {
  const candidate = raw ?? DEFAULT_CHARACTER_ITEM_ID;
  const match = catalog.find(
    (entry) => entry.id === candidate && isEquipableCharacterType(entry.type),
  );
  if (match) return match.id;

  const fallback = catalog.find(
    (entry) => entry.id === DEFAULT_CHARACTER_ITEM_ID && isEquipableCharacterType(entry.type),
  );
  return fallback?.id ?? DEFAULT_CHARACTER_ITEM_ID;
}

export async function listStoreItems(auth: AuthContext): Promise<StoreItemsResponse> {
  await ensureUser(auth);
  const db = getDb();
  const [userRow] = await db
    .select({
      plasmaMinerals: users.plasmaMinerals,
      selectedCharacterId: users.selectedCharacterId,
    })
    .from(users)
    .where(eq(users.id, auth.sub))
    .limit(1);

  if (!userRow) {
    throw new Error('User not found');
  }

  const catalog = await readCatalog();
  const selectedCharacterId = await resolveSelectedCharacterId(
    userRow.selectedCharacterId,
    catalog,
  );
  const unlockedIds = await readUnlockedIds(auth.sub);

  return {
    plasmaMinerals: userRow.plasmaMinerals,
    selectedCharacterId,
    items: buildItemStates(catalog, unlockedIds, selectedCharacterId),
  };
}

export async function purchaseStoreItem(
  auth: AuthContext,
  itemId: string,
): Promise<PurchaseStoreItemResponse> {
  await ensureUser(auth);
  const db = getDb();

  const [item] = await db
    .select()
    .from(storeItems)
    .where(and(eq(storeItems.id, itemId), eq(storeItems.enabled, true)))
    .limit(1);

  if (!item) {
    throw new Error('Unknown store item');
  }
  if (item.defaultUnlocked || item.cost <= 0) {
    throw new Error('Item is already free');
  }

  return db.transaction(async (tx) => {
    const unlocked = await tx
      .select({ itemId: userStoreUnlocks.itemId })
      .from(userStoreUnlocks)
      .where(
        and(eq(userStoreUnlocks.userId, auth.sub), eq(userStoreUnlocks.itemId, itemId)),
      )
      .limit(1);

    if (unlocked.length > 0) {
      throw new Error('Item already unlocked');
    }

    const [spent] = await tx
      .update(users)
      .set({
        plasmaMinerals: sql`${users.plasmaMinerals} - ${item.cost}`,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, auth.sub), sql`${users.plasmaMinerals} >= ${item.cost}`))
      .returning({
        plasmaMinerals: users.plasmaMinerals,
        selectedCharacterId: users.selectedCharacterId,
      });

    if (!spent) {
      throw new Error('Not enough plasma minerals');
    }

    await tx.insert(userStoreUnlocks).values({
      userId: auth.sub,
      itemId,
    });

    const catalog = await tx
      .select()
      .from(storeItems)
      .where(eq(storeItems.enabled, true))
      .orderBy(asc(storeItems.sortOrder), asc(storeItems.name));
    const unlockRows = await tx
      .select({ itemId: userStoreUnlocks.itemId })
      .from(userStoreUnlocks)
      .where(eq(userStoreUnlocks.userId, auth.sub));
    const unlockedIds = new Set(unlockRows.map((row) => row.itemId));
    const selectedCharacterId = await resolveSelectedCharacterId(
      spent.selectedCharacterId,
      catalog,
    );

    return {
      plasmaMinerals: spent.plasmaMinerals,
      itemId,
      items: buildItemStates(catalog, unlockedIds, selectedCharacterId),
    };
  });
}

export async function sellStoreItem(
  auth: AuthContext,
  itemId: string,
): Promise<SellStoreItemResponse> {
  await ensureUser(auth);
  const db = getDb();

  const [item] = await db
    .select()
    .from(storeItems)
    .where(and(eq(storeItems.id, itemId), eq(storeItems.enabled, true)))
    .limit(1);

  if (!item) {
    throw new Error('Unknown store item');
  }
  if (item.defaultUnlocked || item.cost <= 0) {
    throw new Error('Item cannot be sold back');
  }

  const refund = storeSellBackRefund(item.cost);

  const result = await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(userStoreUnlocks)
      .where(
        and(eq(userStoreUnlocks.userId, auth.sub), eq(userStoreUnlocks.itemId, itemId)),
      )
      .returning({ itemId: userStoreUnlocks.itemId });

    if (deleted.length === 0) {
      throw new Error('Item is not unlocked');
    }

    const [userRow] = await tx
      .select({ selectedCharacterId: users.selectedCharacterId })
      .from(users)
      .where(eq(users.id, auth.sub))
      .limit(1);

    let nextSelected = userRow?.selectedCharacterId ?? DEFAULT_CHARACTER_ITEM_ID;
    if (nextSelected === itemId) {
      nextSelected = DEFAULT_CHARACTER_ITEM_ID;
    }

    const [credited] = await tx
      .update(users)
      .set({
        plasmaMinerals: sql`${users.plasmaMinerals} + ${refund}`,
        selectedCharacterId: nextSelected,
        updatedAt: new Date(),
      })
      .where(eq(users.id, auth.sub))
      .returning({
        plasmaMinerals: users.plasmaMinerals,
        selectedCharacterId: users.selectedCharacterId,
      });

    if (!credited) {
      throw new Error('User not found');
    }

    const catalog = await tx
      .select()
      .from(storeItems)
      .where(eq(storeItems.enabled, true))
      .orderBy(asc(storeItems.sortOrder), asc(storeItems.name));
    const unlockRows = await tx
      .select({ itemId: userStoreUnlocks.itemId })
      .from(userStoreUnlocks)
      .where(eq(userStoreUnlocks.userId, auth.sub));
    const unlockedIds = new Set(unlockRows.map((row) => row.itemId));
    const selectedCharacterId = await resolveSelectedCharacterId(
      credited.selectedCharacterId,
      catalog,
    );

    return {
      plasmaMinerals: credited.plasmaMinerals,
      itemId,
      refund,
      selectedCharacterId,
      items: buildItemStates(catalog, unlockedIds, selectedCharacterId),
    };
  });

  refreshPartyForUser(auth.sub);
  return result;
}

export async function selectStoreItem(
  auth: AuthContext,
  itemId: string,
): Promise<SelectStoreItemResponse> {
  await ensureUser(auth);
  const db = getDb();

  const [item] = await db
    .select()
    .from(storeItems)
    .where(and(eq(storeItems.id, itemId), eq(storeItems.enabled, true)))
    .limit(1);

  if (!item) {
    throw new Error('Unknown store item');
  }
  if (!isEquipableCharacterType(item.type)) {
    throw new Error('Item cannot be equipped');
  }

  const unlockedIds = await readUnlockedIds(auth.sub);
  if (!item.defaultUnlocked && !unlockedIds.has(itemId)) {
    throw new Error('Item is locked');
  }

  await db
    .update(users)
    .set({
      selectedCharacterId: itemId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, auth.sub));

  const catalog = await readCatalog();
  refreshPartyForUser(auth.sub);
  return {
    selectedCharacterId: itemId,
    items: buildItemStates(catalog, unlockedIds, itemId),
  };
}
