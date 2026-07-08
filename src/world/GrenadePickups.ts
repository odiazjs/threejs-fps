import * as THREE from 'three';
import {
  sweptOverlapsGrenadePickup,
} from '../../shared/network/grenadePickup';
import { PLAYER_HALF_WIDTH } from '../../shared/level/levelData';
import type { GrenadePickupSnapshot } from '../network/types';
import { GRENADE_PICKUP_GRANT } from '../../shared/throwables/grenadeConfig';
import { loadGrenadePickupStackTemplate } from '../content/grenadeModel';
import { resolvePickupSurfaceY } from './pickupSurface';

export type GrenadePickupHandler = () => void;
type SendPickup = (index: number, feetX: number, feetZ: number) => void;

const PICKUP_RETRY_SEC = 0.15;

export class GrenadePickups {
  private readonly root = new THREE.Group();
  private readonly stacks: THREE.Group[] = [];
  private readonly positions: Array<{ x: number; z: number }> = [];
  private readonly collected = new Set<number>();
  private readonly pickupRetryAt = new Map<number, number>();
  private sendPickup: SendPickup | null = null;
  private onLocalPickup: GrenadePickupHandler | null = null;
  private lastFeetX = 0;
  private lastFeetZ = 0;
  private hasLastFeet = false;
  private elapsed = 0;
  private pickupGrant = GRENADE_PICKUP_GRANT;
  readonly whenReady: Promise<void>;

  constructor(
    scene: THREE.Scene,
    spawnPositions: ReadonlyArray<{ x: number; z: number }>,
    pickupGrant = GRENADE_PICKUP_GRANT,
  ) {
    this.root.name = 'grenade-pickups';
    scene.add(this.root);
    this.pickupGrant = pickupGrant;
    this.whenReady = this.build(spawnPositions);
  }

  async repopulate(
    spawnPositions: ReadonlyArray<{ x: number; z: number }>,
    pickupGrant = this.pickupGrant,
  ): Promise<void> {
    for (const stack of this.stacks) {
      stack.removeFromParent();
    }
    this.stacks.length = 0;
    this.positions.length = 0;
    this.collected.clear();
    this.pickupRetryAt.clear();
    this.hasLastFeet = false;
    this.pickupGrant = pickupGrant;
    await this.build(spawnPositions);
  }

  private async build(spawnPositions: ReadonlyArray<{ x: number; z: number }>): Promise<void> {
    if (spawnPositions.length === 0) return;

    try {
      const template = await loadGrenadePickupStackTemplate(this.pickupGrant);

      for (const pos of spawnPositions) {
        const stack = template.clone(true);
        const y = resolvePickupSurfaceY(pos.x, pos.z);
        stack.position.set(pos.x, y, pos.z);
        this.stacks.push(stack);
        this.positions.push({ x: pos.x, z: pos.z });
        this.root.add(stack);
      }
    } catch (error) {
      console.warn('[GrenadePickups] Failed to load grenade pickup model', error);
    }
  }

  bindNetwork(sendPickup: SendPickup | null, onLocalPickup: GrenadePickupHandler): void {
    this.sendPickup = sendPickup;
    this.onLocalPickup = onLocalPickup;
  }

  applySnapshot(index: number, snapshot: GrenadePickupSnapshot): void {
    const stack = this.stacks[index];
    if (stack) {
      const y = resolvePickupSurfaceY(snapshot.x, snapshot.z);
      stack.position.set(snapshot.x, y, snapshot.z);
      const stored = this.positions[index];
      if (stored) {
        stored.x = snapshot.x;
        stored.z = snapshot.z;
      }
    }

    if (!snapshot.collected) {
      this.restoreCollected(index);
      return;
    }

    this.markCollected(index);
    this.pickupRetryAt.delete(index);
  }

  private restoreCollected(index: number): void {
    this.collected.delete(index);
    const stack = this.stacks[index];
    if (stack) stack.visible = true;
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

  private tryNetworkPickup(
    prevFeetX: number,
    prevFeetZ: number,
    feetX: number,
    feetZ: number,
  ): void {
    for (let index = 0; index < this.positions.length; index++) {
      if (this.collected.has(index)) continue;

      const retryAt = this.pickupRetryAt.get(index);
      if (retryAt !== undefined && this.elapsed < retryAt) continue;

      const pos = this.positions[index]!;
      if (
        !sweptOverlapsGrenadePickup(
          prevFeetX,
          prevFeetZ,
          feetX,
          feetZ,
          pos.x,
          pos.z,
          PLAYER_HALF_WIDTH,
        )
      ) {
        continue;
      }

      this.sendPickup?.(index, feetX, feetZ);
      this.pickupRetryAt.set(index, this.elapsed + PICKUP_RETRY_SEC);
    }
  }

  private tryLocalPickup(
    prevFeetX: number,
    prevFeetZ: number,
    feetX: number,
    feetZ: number,
  ): void {
    for (let index = 0; index < this.positions.length; index++) {
      if (this.collected.has(index)) continue;

      const pos = this.positions[index]!;
      if (
        !sweptOverlapsGrenadePickup(
          prevFeetX,
          prevFeetZ,
          feetX,
          feetZ,
          pos.x,
          pos.z,
          PLAYER_HALF_WIDTH,
        )
      ) {
        continue;
      }

      this.markCollected(index);
      this.onLocalPickup?.();
    }
  }

  private markCollected(index: number): void {
    this.collected.add(index);
    const stack = this.stacks[index];
    if (stack) stack.visible = false;
  }
}
