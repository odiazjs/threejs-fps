import { asc, eq } from 'drizzle-orm';
import type {
  CharactersResponse,
  CharacterState,
  SelectCharacterResponse,
} from '../../../shared/api/characters.js';
import { isCharacterId } from '../../../shared/content/characters.js';
import type { AuthContext } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import { characters } from '../db/schema/characters.js';
import { users } from '../db/schema/users.js';
import { refreshPartyForUser } from '../lobby/partyNotify.js';
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
    bodyAssetFile: string | null;
    perkKey: string;
    perkValue: number;
    perkLabel: string;
    perkDescription: string;
    cost: number;
    defaultUnlocked: boolean;
  },
  selectedId: string,
): CharacterState {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    biography: row.biography,
    faceModelFile: row.faceModelFile,
    bodyAssetFile: row.bodyAssetFile,
    perk: {
      key: row.perkKey,
      value: row.perkValue,
      label: row.perkLabel,
      description: row.perkDescription || row.perkLabel,
    },
    cost: row.cost,
    // Unlock purchase comes later — catalog is fully selectable for now.
    unlocked: true,
    selected: row.id === selectedId,
  };
}

export async function listCharacters(auth: AuthContext): Promise<CharactersResponse> {
  const db = getDb();
  await ensureUserCharacter(auth.sub);

  const [selectedCharacterId, catalog, userRow] = await Promise.all([
    readSelectedOperatorId(auth.sub),
    db
      .select({
        id: characters.id,
        name: characters.name,
        description: characters.description,
        biography: characters.biography,
        faceModelFile: characters.faceModelFile,
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
  ]);

  const selectedSkinId = userRow[0]?.selectedCharacterId ?? 'basic';

  return {
    selectedCharacterId,
    selectedSkinId,
    characters: catalog.map((row) => toState(row, selectedCharacterId)),
  };
}

export async function selectCharacter(
  auth: AuthContext,
  characterId: string,
): Promise<SelectCharacterResponse> {
  if (!isCharacterId(characterId)) {
    throw new Error('Unknown character');
  }

  const selectedCharacterId = await setSelectedOperatorId(auth.sub, characterId);
  refreshPartyForUser(auth.sub);
  const listed = await listCharacters(auth);

  return {
    selectedCharacterId,
    characters: listed.characters.map((entry) => ({
      ...entry,
      selected: entry.id === selectedCharacterId,
    })),
  };
}
