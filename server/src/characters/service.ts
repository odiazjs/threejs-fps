import { asc, eq } from 'drizzle-orm';
import type {
  CharactersResponse,
  CharacterState,
  SelectCharacterResponse,
} from '../../../shared/api/characters.js';
import { isSeasonGatedOperator } from '../../../shared/content/seasonRewards.js';
import type { AuthContext } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import { characters, userOperatorUnlocks } from '../db/schema/characters.js';
import { users } from '../db/schema/users.js';
import { refreshPartyForUser } from '../lobby/partyNotify.js';
import { characterExistsInDb, ensureCharacterCatalogLoaded } from './catalogCache.js';
import {
  ensureUserCharacter,
  readSelectedOperatorId,
  setSelectedOperatorId,
} from './userCharacter.js';

function toState(
  row: {
    id: string;
    name: string;
    description: string;
    biography: string;
    faceModelFile: string;
    iconFile: string | null;
    bodyAssetFile: string | null;
    perkKey: string;
    perkValue: number;
    perkLabel: string;
    perkDescription: string;
    cost: number;
    defaultUnlocked: boolean;
  },
  selectedId: string,
  unlockedIds: ReadonlySet<string>,
): CharacterState {
  const unlocked =
    row.defaultUnlocked ||
    unlockedIds.has(row.id) ||
    !isSeasonGatedOperator(row.id);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    biography: row.biography,
    faceModelFile: row.faceModelFile,
    iconFile: row.iconFile,
    bodyAssetFile: row.bodyAssetFile,
    perk: {
      key: row.perkKey,
      value: row.perkValue,
      label: row.perkLabel,
      description: row.perkDescription || row.perkLabel,
    },
    cost: row.cost,
    unlocked,
    selected: row.id === selectedId,
  };
}

export async function listCharacters(auth: AuthContext): Promise<CharactersResponse> {
  const db = getDb();
  await ensureCharacterCatalogLoaded();
  await ensureUserCharacter(auth.sub);

  const [selectedCharacterId, catalog, userRow, unlockRows] = await Promise.all([
    readSelectedOperatorId(auth.sub),
    db
      .select({
        id: characters.id,
        name: characters.name,
        description: characters.description,
        biography: characters.biography,
        faceModelFile: characters.faceModelFile,
        iconFile: characters.iconFile,
        bodyAssetFile: characters.bodyAssetFile,
        perkKey: characters.perkKey,
        perkValue: characters.perkValue,
        perkLabel: characters.perkLabel,
        perkDescription: characters.perkDescription,
        cost: characters.cost,
        defaultUnlocked: characters.defaultUnlocked,
      })
      .from(characters)
      .where(eq(characters.enabled, true))
      .orderBy(asc(characters.sortOrder), asc(characters.name)),
    db
      .select({ selectedCharacterId: users.selectedCharacterId })
      .from(users)
      .where(eq(users.id, auth.sub))
      .limit(1),
    db
      .select({ characterId: userOperatorUnlocks.characterId })
      .from(userOperatorUnlocks)
      .where(eq(userOperatorUnlocks.userId, auth.sub)),
  ]);

  const selectedSkinId = userRow[0]?.selectedCharacterId ?? 'basic';
  const unlockedIds = new Set(unlockRows.map((row) => row.characterId));

  return {
    selectedCharacterId,
    selectedSkinId,
    characters: catalog.map((row) => toState(row, selectedCharacterId, unlockedIds)),
  };
}

export async function selectCharacter(
  auth: AuthContext,
  characterId: string,
): Promise<SelectCharacterResponse> {
  if (!(await characterExistsInDb(characterId))) {
    throw new Error('Unknown character');
  }

  const listed = await listCharacters(auth);
  const entry = listed.characters.find((c) => c.id === characterId);
  if (!entry?.unlocked) {
    throw new Error('Character is locked');
  }

  const selectedCharacterId = await setSelectedOperatorId(auth.sub, characterId);
  refreshPartyForUser(auth.sub);

  return {
    selectedCharacterId,
    characters: listed.characters.map((c) => ({
      ...c,
      selected: c.id === selectedCharacterId,
    })),
  };
}
