import { DEFAULT_CHARACTER_ITEM_ID } from '../../shared/content/storeItemTypes';

const STORAGE_KEY = 'fps_selected_character_id';
const DEFAULT_MESH_FILE = 'character_basic_tpose.fbx';

/** Fallback meshes before / between store catalog fetches. */
const DEFAULT_MESH_BY_ID: Readonly<Record<string, string>> = {
  basic: 'character_basic_tpose.fbx',
  silver: 'character_silver_tpose.fbx',
};

let activeCharacterId = DEFAULT_CHARACTER_ITEM_ID;
let meshReloadPending = false;
const meshByItemId = new Map<string, string>(Object.entries(DEFAULT_MESH_BY_ID));
const listeners = new Set<() => void>();

function readStoredId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw.length > 0) return raw;
  } catch {
    // ignore
  }
  return DEFAULT_CHARACTER_ITEM_ID;
}

activeCharacterId = readStoredId();

export function rememberStoreItemAssets(
  items: ReadonlyArray<{ id: string; assetFile: string | null }>,
): void {
  for (const item of items) {
    if (item.assetFile) {
      meshByItemId.set(item.id, item.assetFile);
    }
  }
}

export function getActiveCharacterId(): string {
  return activeCharacterId;
}

export function getCharacterMeshFile(characterId: string): string {
  return (
    meshByItemId.get(characterId) ??
    DEFAULT_MESH_BY_ID[characterId] ??
    DEFAULT_MESH_FILE
  );
}

export function getActiveCharacterMeshFile(): string {
  return getCharacterMeshFile(activeCharacterId);
}

export function setActiveCharacterId(characterId: string): void {
  if (!characterId || activeCharacterId === characterId) return;
  activeCharacterId = characterId;
  meshReloadPending = true;
  try {
    localStorage.setItem(STORAGE_KEY, characterId);
  } catch {
    // ignore
  }
  for (const listener of listeners) listener();
}

/** True after equip until lobby consumes it for a character remount. */
export function consumeCharacterMeshReload(): boolean {
  if (!meshReloadPending) return false;
  meshReloadPending = false;
  return true;
}

export function onActiveCharacterChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
