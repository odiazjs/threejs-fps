import { getDb } from '../index.js';
import { storeItems } from '../schema/storeItems.js';
import { CURRENT_STORE_CATALOG } from './storeCatalog.js';

/** Upsert the shipped store catalog. Does not delete extra rows added later via DB. */
export async function upsertCurrentStoreCatalog(): Promise<void> {
  const db = getDb();
  const now = new Date();

  for (const item of CURRENT_STORE_CATALOG) {
    await db
      .insert(storeItems)
      .values({
        id: item.id,
        type: item.type,
        name: item.name,
        description: item.description,
        cost: item.cost,
        defaultUnlocked: item.defaultUnlocked,
        enabled: item.enabled,
        sortOrder: item.sortOrder,
        assetFile: item.assetFile,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: storeItems.id,
        set: {
          type: item.type,
          name: item.name,
          description: item.description,
          cost: item.cost,
          defaultUnlocked: item.defaultUnlocked,
          enabled: item.enabled,
          sortOrder: item.sortOrder,
          assetFile: item.assetFile,
          updatedAt: now,
        },
      });
  }
}
