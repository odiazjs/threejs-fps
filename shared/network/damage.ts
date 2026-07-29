import type { BodyPartId } from '../combat/bodyParts.js';

export interface PlayerHitMessage {
  targetId: string;
  weaponId: string;
  bodyPart?: BodyPartId;
}

/** Sent to the victim when a hit lands — shooter position from fire time (guns) or hit time (melee). */
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
  /** Victim respawn wait (Plasma Harvest scaling). */
  respawnDelaySec?: number;
  /** Minerals granted to the killer (Plasma Harvest). */
  mineralsGranted?: number;
}
