export interface ProjectileSpawnMessage {
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  weaponId?: string;
  /**
   * Shotgun pellet index within one shell (0 = primary).
   * Follow-up pellets still spawn tracers but skip weaponShot SFX.
   */
  pelletIndex?: number;
  /** Set by the server when broadcasting so observers can align VFX to the shooter mesh. */
  shooterId?: string;
  /** Shooter world position at fire time — used for damage direction on victims. */
  shooterWorldX?: number;
  shooterWorldY?: number;
  shooterWorldZ?: number;
}
