export interface ProjectileSpawnMessage {
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  weaponId?: string;
  /** Set by the server when broadcasting so observers can align VFX to the shooter mesh. */
  shooterId?: string;
  /** Shooter world position at fire time — used for damage direction on victims. */
  shooterWorldX?: number;
  shooterWorldY?: number;
  shooterWorldZ?: number;
}
