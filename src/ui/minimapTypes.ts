export interface MinimapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface MinimapLayout {
  label: string;
  bounds: MinimapBounds;
  /** Top-down obstacles (walls, crates) as XZ AABBs. */
  obstacles: ReadonlyArray<{
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    tall?: boolean;
    kind?: 'crate' | 'structure';
  }>;
}

export type MinimapBlipKind = 'self' | 'teammate' | 'enemy';

export interface MinimapBlip {
  x: number;
  z: number;
  kind: MinimapBlipKind;
  yaw?: number;
}

export interface MinimapUpdateState {
  x: number;
  z: number;
  yaw: number;
  blips?: readonly MinimapBlip[];
}
