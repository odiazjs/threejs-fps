export interface PlayerHitMessage {
  targetId: string;
  weaponId: string;
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
  killerName: string;
  victimName: string;
}
