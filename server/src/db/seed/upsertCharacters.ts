import { CHARACTERS } from '../../../../shared/content/characters.js';
import { getDb } from '../index.js';
import { characters } from '../schema/characters.js';

/** Upsert the shipped operator character catalog. */
export async function upsertCurrentCharacterCatalog(): Promise<void> {
  const db = getDb();
  const now = new Date();

  for (const def of Object.values(CHARACTERS)) {
    await db
      .insert(characters)
      .values({
        id: def.id,
        name: def.name,
        description: def.description,
        biography: def.biography,
        faceModelFile: def.faceModelFile,
        bodyAssetFile: def.bodyAssetFile,
        perkKey: def.perk.key,
        perkValue: def.perk.value,
        perkLabel: def.perk.label,
        perkDescription: def.perk.description,
        cost: def.cost,
        defaultUnlocked: def.defaultUnlocked,
        enabled: true,
        sortOrder: def.sortOrder,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: characters.id,
        set: {
          name: def.name,
          description: def.description,
          biography: def.biography,
          faceModelFile: def.faceModelFile,
          bodyAssetFile: def.bodyAssetFile,
          perkKey: def.perk.key,
          perkValue: def.perk.value,
          perkLabel: def.perk.label,
          perkDescription: def.perk.description,
          cost: def.cost,
          defaultUnlocked: def.defaultUnlocked,
          enabled: true,
          sortOrder: def.sortOrder,
          updatedAt: now,
        },
      });
  }
}
