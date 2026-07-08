export interface GrenadeThrowRequest {
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
}

export interface GrenadeThrowBroadcast {
  id: string;
  throwerId: string;
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
