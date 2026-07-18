import { DEFAULT_FACE_MODEL_FILE } from '../../shared/content/characters';

const STORAGE_KEY = 'fps_selected_face_id';

export const DEFAULT_FACE_ID = 'garla';

/** Euler degrees at the neck mount. X = tilt (positive tips the face back). */
export interface CharacterFaceRotationDeg {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
}

export interface CharacterFaceDef {
  readonly id: string;
  readonly name: string;
  /** FBX under /3d/ — head mesh attached at the neck. */
  readonly modelFile: string;
  /** Optional mount rotation in degrees. */
  readonly rotationDeg?: CharacterFaceRotationDeg;
}

/** Shared mount tweak until per-face authored offsets exist. */
const DEFAULT_FACE_ROTATION_DEG: CharacterFaceRotationDeg = { x: -24, y: 0, z: 0 };

/** Runtime face catalog populated from `/api/me/characters`. */
const faceByCharacterId = new Map<string, CharacterFaceDef>();

let activeFaceId = DEFAULT_FACE_ID;

function readStoredFaceId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw.length > 0) return raw;
  } catch {
    // ignore
  }
  return DEFAULT_FACE_ID;
}

activeFaceId = readStoredFaceId();

export function rememberCharacterFaceModels(
  items: ReadonlyArray<{
    id: string;
    name?: string;
    faceModelFile?: string | null;
  }>,
): void {
  for (const item of items) {
    const modelFile = item.faceModelFile?.trim() || DEFAULT_FACE_MODEL_FILE;
    const prev = faceByCharacterId.get(item.id);
    faceByCharacterId.set(item.id, {
      id: item.id,
      name: item.name?.trim() || prev?.name || item.id,
      modelFile,
      rotationDeg: prev?.rotationDeg ?? DEFAULT_FACE_ROTATION_DEG,
    });
  }
}

export function getActiveFaceId(): string {
  return activeFaceId;
}

export function setActiveFaceId(faceId: string): void {
  if (!faceId || activeFaceId === faceId) return;
  if (!faceByCharacterId.has(faceId) && faceId !== DEFAULT_FACE_ID) return;
  activeFaceId = faceId;
  try {
    localStorage.setItem(STORAGE_KEY, faceId);
  } catch {
    // ignore
  }
}

export function getFaceDef(faceId: string): CharacterFaceDef {
  const cached = faceByCharacterId.get(faceId);
  if (cached) return cached;

  const fallback = faceByCharacterId.get(DEFAULT_FACE_ID);
  if (fallback) return fallback;

  return {
    id: DEFAULT_FACE_ID,
    name: 'Operator',
    modelFile: DEFAULT_FACE_MODEL_FILE,
    rotationDeg: DEFAULT_FACE_ROTATION_DEG,
  };
}

/**
 * Resolve which face head to mount.
 * Pass an operator character id from the characters API / network state.
 * Store skin ids fall back to the default face.
 */
export function resolveFaceIdForCharacter(characterId: string): string {
  if (characterId && faceByCharacterId.has(characterId)) return characterId;
  return DEFAULT_FACE_ID;
}
