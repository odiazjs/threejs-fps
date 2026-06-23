import * as THREE from 'three';
import {
  AMMO_BOX_POSITIONS,
  sweptOverlapsAmmoBox,
} from '../../shared/level/ammoBoxSpawns';
import { PLAYER_HALF_WIDTH } from '../../shared/level/levelData';
import type { AmmoBoxSnapshot } from '../network/types';
import { createAmmoBox } from './ammoBoxVisual';

export type LocalPickupHandler = () => void;
type SendPickup = (index: number, feetX: number, feetZ: number) => void;

const PICKUP_RETRY_SEC = 0.15;

export class AmmoPickups {
  private readonly boxes: THREE.Group[] = [];
  private readonly collected = new Set<number>();
  private readonly pickupRetryAt = new Map<number, number>();
  private sendPickup: SendPickup | null = null;
  private onLocalPickup: LocalPickupHandler | null = null;
  private lastFeetX = 0;
  private lastFeetZ = 0;
  private hasLastFeet = false;
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    const group = new THREE.Group();
    group.name = 'ammo-pickups';

    for (const pos of AMMO_BOX_POSITIONS) {
      const box = createAmmoBox();
      box.position.set(pos.x, 0, pos.z);
      this.boxes.push(box);
      group.add(box);
    }

    scene.add(group);
  }

  bindNetwork(
    sendPickup: SendPickup | null,
    onLocalPickup: LocalPickupHandler,
  ): void {
    this.sendPickup = sendPickup;
    this.onLocalPickup = onLocalPickup;
  }

  applySnapshot(index: number, snapshot: AmmoBoxSnapshot): void {
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

    for (let i = 0; i < AMMO_BOX_POSITIONS.length; i++) {
      if (this.collected.has(i)) continue;

      const { x, z } = AMMO_BOX_POSITIONS[i];
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
    for (let i = 0; i < AMMO_BOX_POSITIONS.length; i++) {
      const { x, z } = AMMO_BOX_POSITIONS[i];
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
