import {
  CHARACTERS,
  DEFAULT_FACE_MODEL_FILE,
  getCharacterDef,
  isCharacterId,
} from '../../shared/content/characters';

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

/** Client face catalog — model paths may be overridden by store API. */
export const CHARACTER_FACES: Readonly<Record<string, CharacterFaceDef>> = {
  garla: {
    id: 'garla',
    name: 'Garla',
    modelFile: CHARACTERS.garla!.faceModelFile,
    rotationDeg: DEFAULT_FACE_ROTATION_DEG,
  },
  olrick: {
    id: 'olrick',
    name: 'Olrick',
    modelFile: CHARACTERS.olrick!.faceModelFile,
    rotationDeg: DEFAULT_FACE_ROTATION_DEG,
  },
  morgana: {
    id: 'morgana',
    name: 'Morgana',
    modelFile: CHARACTERS.morgana!.faceModelFile,
    rotationDeg: DEFAULT_FACE_ROTATION_DEG,
  },
  p_anne: {
    id: 'p_anne',
    name: 'P. Anne',
    modelFile: CHARACTERS.p_anne!.faceModelFile,
    rotationDeg: DEFAULT_FACE_ROTATION_DEG,
  },
};

/** Runtime overrides from store catalog (`faceModelFile`). */
const faceModelByCharacterId = new Map<string, string>();

let activeFaceId = DEFAULT_FACE_ID;

function readStoredFaceId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw in CHARACTER_FACES) return raw;
  } catch {
    // ignore
  }
  return DEFAULT_FACE_ID;
}

activeFaceId = readStoredFaceId();

export function rememberCharacterFaceModels(
  items: ReadonlyArray<{ id: string; faceModelFile?: string | null }>,
): void {
  for (const item of items) {
    if (item.faceModelFile) {
      faceModelByCharacterId.set(item.id, item.faceModelFile);
    }
  }
}

export function getActiveFaceId(): string {
  return activeFaceId;
}

export function setActiveFaceId(faceId: string): void {
  if (!faceId || !(faceId in CHARACTER_FACES) || activeFaceId === faceId) return;
  activeFaceId = faceId;
  try {
    localStorage.setItem(STORAGE_KEY, faceId);
  } catch {
    // ignore
  }
}

export function getFaceDef(faceId: string): CharacterFaceDef {
  const base =
    CHARACTER_FACES[faceId] ??
    (isCharacterId(faceId)
      ? {
          id: faceId,
          name: getCharacterDef(faceId).name,
          modelFile: getCharacterDef(faceId).faceModelFile,
          rotationDeg: DEFAULT_FACE_ROTATION_DEG,
        }
      : CHARACTER_FACES[DEFAULT_FACE_ID]!);

  const override = faceModelByCharacterId.get(faceId);
  if (override) {
    return { ...base, modelFile: override };
  }
  return base.modelFile ? base : { ...base, modelFile: DEFAULT_FACE_MODEL_FILE };
}

/**
 * Resolve which face head to mount.
 * Pass an operator character id (garla, …). Store skin ids fall back to the default face.
 */
export function resolveFaceIdForCharacter(characterId: string): string {
  if (isCharacterId(characterId)) return characterId;
  return DEFAULT_FACE_ID;
}
