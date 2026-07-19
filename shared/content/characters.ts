/**
 * Operator character constants / combat helpers.
 * Catalog rows (name, bio, perk, face) live in the DB and are served via `/api/me/characters`.
 */

/** Default selected operator in `user_character` (must exist in DB seed). */
export const DEFAULT_OPERATOR_CHARACTER_ID = 'garla';

/** Fallback face model under /3d/ when the client has not cached a character yet. */
export const DEFAULT_FACE_MODEL_FILE = 'characters/garla_face.glb';

export type CharacterPerkKey = 'weapon_damage_flat';

/** Apply a flat weapon-damage perk bonus (bonus already resolved from DB). */
export function applyCharacterWeaponDamage(
  baseDamage: number,
  weaponDamageBonus: number,
): number {
  return Math.max(0, baseDamage + Math.max(0, weaponDamageBonus));
}

