import { DEFAULT_FACE_MODEL_FILE } from '../../shared/content/characters';

const STORAGE_KEY = 'fps_selected_face_id';

export const DEFAULT_FACE_ID = 'garla';

/** Euler degrees at the neck mount. X = tilt (positive tips the face back). */
export interface CharacterFaceRotationDeg {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
}

/** Per-character face mount tuning (edit here — not stored in DB). */
export interface CharacterFaceMountConfig {
  /** Uniform scale after shared head-height normalize (1 = default). */
  readonly scale?: number;
  /** Extra mount offset Y in Mixamo cm space (negative seats lower). */
  readonly offsetY?: number;
  /** Extra mount offset Z in Mixamo cm space. */
  readonly offsetZ?: number;
  /** Optional mount rotation in degrees. */
  readonly rotationDeg?: CharacterFaceRotationDeg;
}

export interface CharacterFaceDef {
  readonly id: string;
  readonly name: string;
  /** Mesh under /3d/ — head attached at the neck (from API / fallback). */
  readonly modelFile: string;
  readonly scale: number;
  readonly offsetY: number;
  readonly offsetZ: number;
  readonly rotationDeg?: CharacterFaceRotationDeg;
}

const DEFAULT_FACE_SCALE = 1;
const DEFAULT_FACE_OFFSET_Y = -6;
const DEFAULT_FACE_OFFSET_Z = -2;
const DEFAULT_FACE_ROTATION_DEG: CharacterFaceRotationDeg = { x: -24, y: 0, z: 0 };

/**
 * Tunable face mount overrides per operator id.
 * `modelFile` still comes from `/api/me/characters` (DB).
 * offsetY: less is lower
 * offsetZ: less is closer to the camera
 */
export const FACE_MOUNT_BY_CHARACTER_ID: Readonly<
  Record<string, CharacterFaceMountConfig>
> = {
  garla: {
    scale: 1,
    offsetY: -6,
    offsetZ: -2,
    rotationDeg: DEFAULT_FACE_ROTATION_DEG,
  },
  olrick: {
    scale: 1.10,
    offsetY: -9,
    offsetZ: -2,
    rotationDeg: DEFAULT_FACE_ROTATION_DEG,
  },
  morgana: {
    scale: 1,
    offsetY: -8,
    offsetZ: -2,
    rotationDeg: DEFAULT_FACE_ROTATION_DEG,
  },
  p_anne: {
    scale: 1,
    offsetY: -6,
    offsetZ: -2,
    rotationDeg: DEFAULT_FACE_ROTATION_DEG,
  },
  steve: {
    scale: 0.80,
    offsetY: -0.5,
    offsetZ: -2,
    rotationDeg: DEFAULT_FACE_ROTATION_DEG,
  },
};

/** Runtime face catalog: API model paths + local mount tuning. */
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

function mountConfigFor(characterId: string): Required<
  Pick<CharacterFaceMountConfig, 'scale' | 'offsetY' | 'offsetZ'>
> & { rotationDeg: CharacterFaceRotationDeg } {
  const mount = FACE_MOUNT_BY_CHARACTER_ID[characterId];
  return {
    scale: Math.max(0.01, mount?.scale ?? DEFAULT_FACE_SCALE),
    offsetY: mount?.offsetY ?? DEFAULT_FACE_OFFSET_Y,
    offsetZ: mount?.offsetZ ?? DEFAULT_FACE_OFFSET_Z,
    rotationDeg: mount?.rotationDeg ?? DEFAULT_FACE_ROTATION_DEG,
  };
}

function buildFaceDef(
  id: string,
  name: string,
  modelFile: string,
): CharacterFaceDef {
  const mount = mountConfigFor(id);
  return {
    id,
    name,
    modelFile,
    scale: mount.scale,
    offsetY: mount.offsetY,
    offsetZ: mount.offsetZ,
    rotationDeg: mount.rotationDeg,
  };
}

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
    faceByCharacterId.set(
      item.id,
      buildFaceDef(
        item.id,
        item.name?.trim() || prev?.name || item.id,
        modelFile,
      ),
    );
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
  if (cached) {
    // Re-apply mount config so local edits hot-reload without waiting for API.
    return buildFaceDef(cached.id, cached.name, cached.modelFile);
  }

  const fallback = faceByCharacterId.get(DEFAULT_FACE_ID);
  if (fallback) {
    return buildFaceDef(faceId, faceId, fallback.modelFile);
  }

  return buildFaceDef(DEFAULT_FACE_ID, 'Operator', DEFAULT_FACE_MODEL_FILE);
}

/**
 * Resolve which face head to mount.
 * Pass an operator character id from the characters API / network state.
 * Store skin ids fall back to the default face.
 */
export function resolveFaceIdForCharacter(characterId: string): string {
  if (characterId && faceByCharacterId.has(characterId)) return characterId;
  if (characterId && characterId in FACE_MOUNT_BY_CHARACTER_ID) return characterId;
  return DEFAULT_FACE_ID;
}
