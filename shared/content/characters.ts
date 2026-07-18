/**
 * Operator characters (face head + perk).
 * Equipped via the Characters page — not sold in the store (store = body skins).
 */

export type CharacterPerkKey = 'weapon_damage_flat';

export interface CharacterPerkDef {
  readonly key: CharacterPerkKey;
  readonly value: number;
  /** Ability title shown in the Characters HUD. */
  readonly label: string;
  /** Short perk blurb under the ability title. */
  readonly description: string;
}

export interface CharacterDef {
  readonly id: string;
  readonly name: string;
  /** Short catalog blurb. */
  readonly description: string;
  /** Longer biography for the Characters page. */
  readonly biography: string;
  /** FBX under /3d/ for the head attached at the neck. */
  readonly faceModelFile: string;
  /** Body mesh used while this character is equipped (shared chassis for now). */
  readonly bodyAssetFile: string;
  readonly perk: CharacterPerkDef;
  readonly cost: number;
  readonly defaultUnlocked: boolean;
  readonly sortOrder: number;
}

/** Placeholder face path until per-character head FBXs ship. */
export const DEFAULT_FACE_MODEL_FILE = 'characters/character_garla.fbx';
export const DEFAULT_CHARACTER_BODY_FILE = 'character_basic_tpose.fbx';

export const CHARACTERS: Readonly<Record<string, CharacterDef>> = {
  garla: {
    id: 'garla',
    name: 'Garla',
    description: 'Scarred operator with a digital combat visage.',
    biography:
      'Garla was rebuilt after a boarding action left little more than a combat cortex and a will to finish the fight. ' +
      'Her visor maps threat vectors in hard light; every weapon in her hands hits a shade harder than doctrine allows. ' +
      'Crews call her the edge of the blade — first through the hatch, last to leave a kill zone.',
    faceModelFile: DEFAULT_FACE_MODEL_FILE,
    bodyAssetFile: DEFAULT_CHARACTER_BODY_FILE,
    perk: {
      key: 'weapon_damage_flat',
      value: 1,
      label: 'Weapon Specialization',
      description: '+1 damage with all weapons.',
    },
    cost: 0,
    defaultUnlocked: true,
    sortOrder: 10,
  },
  olrick: {
    id: 'olrick',
    name: 'Olrick',
    description: 'Stoic heavy — face module pending.',
    biography:
      'Olrick carries the weight of a failed orbital drop and the armor that saved him. ' +
      'Quiet on the channel, louder in the breach — he holds lanes so lighter operators can move. ' +
      'His face module is still in fabrication; until then he borrows the company visor pattern.',
    faceModelFile: DEFAULT_FACE_MODEL_FILE,
    bodyAssetFile: DEFAULT_CHARACTER_BODY_FILE,
    perk: {
      key: 'weapon_damage_flat',
      value: 0,
      label: 'Fortress Protocol',
      description: 'Perk module incoming — hold the line until then.',
    },
    cost: 1500,
    defaultUnlocked: false,
    sortOrder: 20,
  },
  morgana: {
    id: 'morgana',
    name: 'Morgana',
    description: 'Shadow specialist — face module pending.',
    biography:
      'Morgana cuts through sensor fog the way others cut through doors. ' +
      'She was trained for silent corridors and compromised decks where a single footprint is a death sentence. ' +
      'Her combat face is still classified; the roster shows a placeholder until clearance clears.',
    faceModelFile: DEFAULT_FACE_MODEL_FILE,
    bodyAssetFile: DEFAULT_CHARACTER_BODY_FILE,
    perk: {
      key: 'weapon_damage_flat',
      value: 0,
      label: 'Umbral Step',
      description: 'Perk module incoming — stay off the scopes until then.',
    },
    cost: 2500,
    defaultUnlocked: false,
    sortOrder: 30,
  },
  p_anne: {
    id: 'p_anne',
    name: 'P. Anne',
    description: 'Precision striker — face module pending.',
    biography:
      'P. Anne measures fights in millimeters and milliseconds. ' +
      'Ex-range instructor turned field operator, she prefers one perfect shot to a magazine of noise. ' +
      'Her personal face mesh is queued; until it ships she runs the shared digital visor.',
    faceModelFile: DEFAULT_FACE_MODEL_FILE,
    bodyAssetFile: DEFAULT_CHARACTER_BODY_FILE,
    perk: {
      key: 'weapon_damage_flat',
      value: 0,
      label: 'Deadeye Calculus',
      description: 'Perk module incoming — keep the reticle honest until then.',
    },
    cost: 3500,
    defaultUnlocked: false,
    sortOrder: 40,
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as readonly string[];

/** Default selected operator in `user_character`. */
export const DEFAULT_OPERATOR_CHARACTER_ID = 'garla';

export function getCharacterDef(characterId: string): CharacterDef {
  return CHARACTERS[characterId] ?? CHARACTERS[DEFAULT_OPERATOR_CHARACTER_ID]!;
}

export function isCharacterId(value: string): boolean {
  return value in CHARACTERS;
}

/**
 * Flat weapon damage bonus from an equipped *operator* character perk.
 * Store skin ids (basic, silver, …) return 0 — perks are not tied to skins.
 */
export function getCharacterWeaponDamageBonus(characterId: string): number {
  if (!isCharacterId(characterId)) return 0;
  const perk = CHARACTERS[characterId]!.perk;
  if (perk.key === 'weapon_damage_flat') return Math.max(0, perk.value);
  return 0;
}

export function applyCharacterWeaponDamage(
  baseDamage: number,
  characterId: string,
): number {
  return Math.max(0, baseDamage + getCharacterWeaponDamageBonus(characterId));
}
