export interface GrenadeThrowRequest {
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  /**
   * Seconds of fuse remaining when the grenade leaves the hand (after cooking).
   * Omitted / undefined = full fuse. Clamped server-side to [0, GRENADE_FUSE_SEC].
   */
  fuseRemainingSec?: number;
}

export interface GrenadeThrowBroadcast {
  id: string;
  throwerId: string;
  throwerTeamId?: number;
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  fuseEndAt: number;
}

export interface GrenadeExplosionBroadcast {
  id: string;
  throwerId: string;
  x: number;
  y: number;
  z: number;
}

/** Client-reported authoritative detonation position for one of its grenades. */
export interface GrenadeDetonateRequest {
  id: string;
  x: number;
  y: number;
  z: number;
}
