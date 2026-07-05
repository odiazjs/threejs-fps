import * as THREE from 'three';
import {
  AMMO_BOX_HALF_SIZE,
  sweptOverlapsAmmoBox,
} from '../../shared/level/ammoBoxSpawns';
import { PLAYER_HALF_WIDTH } from '../../shared/level/levelData';
import { getClientMapDef } from '../../shared/level/maps';
import type { AmmoBoxSnapshot } from '../network/types';
import { loadAmmoBoxTemplate } from './ammoBoxVisual';

export type LocalPickupHandler = () => void;
type SendPickup = (index: number, feetX: number, feetZ: number) => void;

const PICKUP_RETRY_SEC = 0.15;

export class AmmoPickups {
  private readonly root = new THREE.Group();
  private readonly boxes: THREE.Group[] = [];
  private readonly positions: Array<{ x: number; z: number }> = [];
  private readonly collected = new Set<number>();
  private readonly pickupRetryAt = new Map<number, number>();
  private sendPickup: SendPickup | null = null;
  private onLocalPickup: LocalPickupHandler | null = null;
  private lastFeetX = 0;
  private lastFeetZ = 0;
  private hasLastFeet = false;
  private elapsed = 0;
  readonly whenReady: Promise<void>;

  constructor(scene: THREE.Scene, spawnPositions: ReadonlyArray<{ x: number; z: number }>) {
    this.root.name = 'ammo-pickups';
    scene.add(this.root);
    this.whenReady = this.build(spawnPositions);
  }

  private async build(spawnPositions: ReadonlyArray<{ x: number; z: number }>): Promise<void> {
    try {
      const template = await loadAmmoBoxTemplate();
      const groundY = getClientMapDef().sampleGroundHeight;

      for (const pos of spawnPositions) {
        const box = template.clone(true);
        const y = groundY(pos.x, pos.z);
        box.position.set(pos.x, y, pos.z);
        this.boxes.push(box);
        this.positions.push({ x: pos.x, z: pos.z });
        this.root.add(box);
      }
    } catch (error) {
      console.warn('[AmmoPickups] Failed to load ammo box model', error);
    }
  }

  bindNetwork(
    sendPickup: SendPickup | null,
    onLocalPickup: LocalPickupHandler,
  ): void {
    this.sendPickup = sendPickup;
    this.onLocalPickup = onLocalPickup;
  }

  applySnapshot(index: number, snapshot: AmmoBoxSnapshot): void {
    const box = this.boxes[index];
    if (box) {
      const groundY = getClientMapDef().sampleGroundHeight(snapshot.x, snapshot.z);
      box.position.set(snapshot.x, groundY, snapshot.z);
      const stored = this.positions[index];
      if (stored) {
        stored.x = snapshot.x;
        stored.z = snapshot.z;
      }
    }

    if (!snapshot.collected) return;
    this.markCollected(index);
    this.pickupRetryAt.delete(index);
  }

  tryPickup(feetX: number, feetZ: number, delta: number): void {
    this.elapsed += delta;

    const prevFeetX = this.hasLastFeet ? this.lastFeetX : feetX;
    const prevFeetZ = this.hasLastFeet ? this.lastFeetZ : feetZ;

    if (this.sendPickup) {
      this.tryNetworkPickup(prevFeetX, prevFeetZ, feetX, feetZ);
    } else {
      this.tryLocalPickup(prevFeetX, prevFeetZ, feetX, feetZ);
    }

    this.lastFeetX = feetX;
    this.lastFeetZ = feetZ;
    this.hasLastFeet = true;
  }

  private overlapsBox(
    prevFeetX: number,
    prevFeetZ: number,
    feetX: number,
    feetZ: number,
    boxX: number,
    boxZ: number,
  ): boolean {
    return sweptOverlapsAmmoBox(
      prevFeetX,
      prevFeetZ,
      feetX,
      feetZ,
      boxX,
      boxZ,
      PLAYER_HALF_WIDTH,
    );
  }

  private tryLocalPickup(
    prevFeetX: number,
    prevFeetZ: number,
    feetX: number,
    feetZ: number,
  ): void {
    let picked = 0;

    for (let i = 0; i < this.positions.length; i++) {
      if (this.collected.has(i)) continue;

      const { x, z } = this.positions[i];
      if (!this.overlapsBox(prevFeetX, prevFeetZ, feetX, feetZ, x, z)) continue;

      this.markCollected(i);
      picked += 1;
    }

    for (let i = 0; i < picked; i++) {
      this.onLocalPickup?.();
    }
  }

  private tryNetworkPickup(
    prevFeetX: number,
    prevFeetZ: number,
    feetX: number,
    feetZ: number,
  ): void {
    for (let i = 0; i < this.positions.length; i++) {
      const { x, z } = this.positions[i];
      const overlapping = this.overlapsBox(prevFeetX, prevFeetZ, feetX, feetZ, x, z);

      if (!overlapping) {
        this.pickupRetryAt.delete(i);
        continue;
      }

      if (this.collected.has(i)) continue;

      const retryAt = this.pickupRetryAt.get(i) ?? 0;
      if (this.elapsed < retryAt) continue;

      this.pickupRetryAt.set(i, this.elapsed + PICKUP_RETRY_SEC);
      this.sendPickup!(i, feetX, feetZ);
    }
  }

  private markCollected(index: number): void {
    if (this.collected.has(index)) return;

    this.collected.add(index);
    this.boxes[index].visible = false;
  }
}

// Re-export for any callers that still reference the constant size.
export { AMMO_BOX_HALF_SIZE };
