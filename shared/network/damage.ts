import type { BodyPartId } from '../combat/bodyParts.js';

export interface PlayerHitMessage {
  targetId: string;
  weaponId: string;
  bodyPart?: BodyPartId;
}

/** Sent to the victim when a hit lands — includes shooter position from fire time. */
export interface PlayerDamagedMessage {
  shooterId: string;
  shooterWorldX: number;
  shooterWorldY: number;
  shooterWorldZ: number;
  absorbedByShield: number;
  dealtToHealth: number;
  shieldBroken: boolean;
}

export interface KillFeedMessage {
  killerId: string;
  killerName: string;
  victimName: string;
}
