import * as THREE from 'three';
import {
  SHIELD_CHARGE_POSITIONS,
  sweptOverlapsShieldCharge,
} from '../../shared/level/shieldChargeSpawns';
import { PLAYER_HALF_WIDTH } from '../../shared/level/levelData';
import type { ShieldChargeSnapshot } from '../network/types';
import { createShieldChargePickup } from './shieldChargeVisual';

export type LocalShieldPickupHandler = () => void;
type SendPickup = (index: number, feetX: number, feetZ: number) => void;

const PICKUP_RETRY_SEC = 0.15;

export class ShieldChargePickups {
  private readonly pickups: THREE.Group[] = [];
  private readonly collected = new Set<number>();
  private readonly pickupRetryAt = new Map<number, number>();
  private sendPickup: SendPickup | null = null;
  private onLocalPickup: LocalShieldPickupHandler | null = null;
  private canPickup: () => boolean = () => true;
  private lastFeetX = 0;
  private lastFeetZ = 0;
  private hasLastFeet = false;
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    const group = new THREE.Group();
    group.name = 'shield-charge-pickups';

    for (const pos of SHIELD_CHARGE_POSITIONS) {
      const pickup = createShieldChargePickup();
      pickup.position.set(pos.x, 0, pos.z);
      this.pickups.push(pickup);
      group.add(pickup);
    }

    scene.add(group);
  }

  bindNetwork(
    sendPickup: SendPickup | null,
    onLocalPickup: LocalShieldPickupHandler,
    canPickup: () => boolean = () => true,
  ): void {
    this.sendPickup = sendPickup;
    this.onLocalPickup = onLocalPickup;
    this.canPickup = canPickup;
  }

  applySnapshot(index: number, snapshot: ShieldChargeSnapshot): void {
    if (!snapshot.collected) return;
    this.markCollected(index);
    this.pickupRetryAt.delete(index);
  }

  tryPickup(feetX: number, feetZ: number, delta: number): void {
    if (!this.canPickup()) return;

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

  private overlapsPickup(
    prevFeetX: number,
    prevFeetZ: number,
    feetX: number,
    feetZ: number,
    chargeX: number,
    chargeZ: number,
  ): boolean {
    return sweptOverlapsShieldCharge(
      prevFeetX,
      prevFeetZ,
      feetX,
      feetZ,
      chargeX,
      chargeZ,
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

    for (let i = 0; i < SHIELD_CHARGE_POSITIONS.length; i++) {
      if (this.collected.has(i)) continue;

      const { x, z } = SHIELD_CHARGE_POSITIONS[i]!;
      if (!this.overlapsPickup(prevFeetX, prevFeetZ, feetX, feetZ, x, z)) continue;

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
    for (let i = 0; i < SHIELD_CHARGE_POSITIONS.length; i++) {
      const { x, z } = SHIELD_CHARGE_POSITIONS[i]!;
      const overlapping = this.overlapsPickup(prevFeetX, prevFeetZ, feetX, feetZ, x, z);

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
    this.pickups[index]!.visible = false;
  }
}
