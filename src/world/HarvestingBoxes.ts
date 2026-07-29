import * as THREE from 'three';
import {
  HARVESTING_BOX_INTERACT_DISTANCE,
  harvestingBoxInstallSpot,
  type HarvestingBoxSpawn,
} from '../../shared/level/harvestingBoxSpawns';
import { HarvestingBoxOutlineFx } from '../effects/HarvestingBoxOutlineFx';
import { createHarvestingBoxMesh } from './harvestingBoxVisual';
import { resolvePickupPlacementY } from './pickupSurface';

export interface HarvestingBoxInstance {
  readonly index: number;
  readonly teamId: number;
  readonly group: THREE.Group;
  /** Immutable home marker (install proximity). */
  homeX: number;
  homeY: number;
  homeZ: number;
  /** Ground position when not carried. */
  spawnX: number;
  spawnY: number;
  spawnZ: number;
  carriedBySessionId: string;
}

/** Local FP carry offset (camera-local, hipfire-ish). */
export const LOCAL_CARRY_OFFSET = new THREE.Vector3(0.28, -0.32, -0.55);
export const LOCAL_CARRY_SCALE = 0.45;
export const LOCAL_CARRY_ROTATION = new THREE.Euler(0.15, -0.35, 0.1);

/** Remote hand attach ù Mixamo bone space (weapons use ~fitScale; crate needs ~world 0.55m). */
export const REMOTE_CARRY_POSITION = new THREE.Vector3(4, 22, 8);
export const REMOTE_CARRY_ROTATION = new THREE.Euler(0.15, Math.PI, 0.25);
export const REMOTE_CARRY_SCALE = 82.5;

export class HarvestingBoxes {
  readonly group = new THREE.Group();
  private boxes: HarvestingBoxInstance[] = [];
  private ready = false;

  constructor(private readonly scene: THREE.Scene) {
    this.group.name = 'harvestingBoxes';
    this.scene.add(this.group);
  }

  async load(spawns: readonly HarvestingBoxSpawn[]): Promise<void> {
    this.clear();
    if (spawns.length === 0) {
      this.ready = true;
      return;
    }

    const instances: HarvestingBoxInstance[] = [];
    for (const spawn of spawns) {
      const mesh = await createHarvestingBoxMesh();
      const root = new THREE.Group();
      root.name = `harvestingBox_${spawn.index}`;
      // Mesh already has feet at local y=0 ù place at marker height (do not
      // re-snap world AABB to y=0 or elevated bases bury the crate).
      const placeY = resolvePickupPlacementY(spawn.x, spawn.z, spawn.y);
      root.position.set(spawn.x, placeY, spawn.z);
      root.add(mesh);
      this.group.add(root);
      HarvestingBoxOutlineFx.attach(root, spawn.teamId);

      instances.push({
        index: spawn.index,
        teamId: spawn.teamId,
        group: root,
        homeX: spawn.x,
        homeY: placeY,
        homeZ: spawn.z,
        spawnX: spawn.x,
        spawnY: placeY,
        spawnZ: spawn.z,
        carriedBySessionId: '',
      });
    }

    this.boxes = instances;
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  getBoxes(): readonly HarvestingBoxInstance[] {
    return this.boxes;
  }

  getBox(index: number): HarvestingBoxInstance | null {
    return this.boxes.find((box) => box.index === index) ?? null;
  }

  /** Nearest ground box within interact range (not currently carried). */
  findGroundInteractable(
    playerX: number,
    playerZ: number,
  ): HarvestingBoxInstance | null {
    let best: HarvestingBoxInstance | null = null;
    let bestDist = Infinity;
    for (const box of this.boxes) {
      if (box.carriedBySessionId) continue;
      const dist = Math.hypot(playerX - box.spawnX, playerZ - box.spawnZ);
      if (dist > HARVESTING_BOX_INTERACT_DISTANCE) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = box;
      }
    }
    return best;
  }

  /** True when carrying an enemy box and standing at your own-base install spot. */
  isNearInstallSpot(
    carriedEnemyBox: HarvestingBoxInstance,
    localTeamId: number,
    playerX: number,
    playerZ: number,
  ): boolean {
    if (carriedEnemyBox.teamId === localTeamId) return false;
    const ownHome = this.boxes.find((box) => box.teamId === localTeamId);
    if (!ownHome) return false;
    const spot = harvestingBoxInstallSpot(ownHome.homeX, ownHome.homeZ);
    return (
      Math.hypot(playerX - spot.x, playerZ - spot.z) <=
      HARVESTING_BOX_INTERACT_DISTANCE
    );
  }

  /** Own-base install spot for a team (1m in front of that team's box home). */
  getInstallSpotForTeam(teamId: number): { x: number; z: number } | null {
    const ownHome = this.boxes.find((box) => box.teamId === teamId);
    if (!ownHome) return null;
    return harvestingBoxInstallSpot(ownHome.homeX, ownHome.homeZ);
  }

  applyServerState(
    states: ReadonlyArray<{
      index: number;
      x: number;
      y: number;
      z: number;
      homeX?: number;
      homeY?: number;
      homeZ?: number;
      carriedBySessionId: string;
    }>,
  ): void {
    for (const state of states) {
      const box = this.getBox(state.index);
      if (!box) continue;
      box.carriedBySessionId = state.carriedBySessionId;
      box.spawnX = state.x;
      box.spawnZ = state.z;
      if (typeof state.homeX === 'number') box.homeX = state.homeX;
      if (typeof state.homeZ === 'number') box.homeZ = state.homeZ;
      // Prefer non-zero server homeY; otherwise keep GLB-extracted home height.
      if (typeof state.homeY === 'number' && state.homeY > 1e-3) {
        box.homeY = state.homeY;
      }

      const atHome =
        Math.hypot(state.x - box.homeX, state.z - box.homeZ) < 0.75;
      // Server harvest sampleGroundHeight is 0 ù keep extracted home Y at base.
      // Player drops send feet Y > 0 and win over home.
      box.spawnY =
        state.y > 1e-3 ? state.y : atHome ? box.homeY : state.y;

      if (!state.carriedBySessionId) {
        this.parkOnGround(box);
      }
    }
  }

  /**
   * Parent each carried box to local camera or remote hand; park the rest.
   * Call every frame after applyServerState.
   */
  syncCarryParents(options: {
    localSessionId: string | null;
    localCamera: THREE.Object3D | null;
    getRemoteHand: (sessionId: string) => THREE.Object3D | null;
  }): void {
    const { localSessionId, localCamera, getRemoteHand } = options;
    for (const box of this.boxes) {
      const carrier = box.carriedBySessionId;
      if (!carrier) {
        this.parkOnGround(box);
        continue;
      }

      if (localSessionId && carrier === localSessionId && localCamera) {
        if (box.group.parent !== localCamera) {
          localCamera.add(box.group);
        }
        box.group.position.copy(LOCAL_CARRY_OFFSET);
        box.group.rotation.copy(LOCAL_CARRY_ROTATION);
        box.group.scale.setScalar(LOCAL_CARRY_SCALE);
        box.group.visible = true;
        continue;
      }

      const hand = getRemoteHand(carrier);
      if (hand) {
        if (box.group.parent !== hand) {
          hand.add(box.group);
        }
        box.group.position.copy(REMOTE_CARRY_POSITION);
        box.group.rotation.copy(REMOTE_CARRY_ROTATION);
        box.group.scale.setScalar(REMOTE_CARRY_SCALE);
        box.group.visible = true;
      } else {
        box.group.visible = false;
      }
    }
  }

  private parkOnGround(box: HarvestingBoxInstance): void {
    if (box.group.parent !== this.group) {
      this.group.attach(box.group);
    }
    const y = resolvePickupPlacementY(box.spawnX, box.spawnZ, box.spawnY);
    box.group.position.set(box.spawnX, y, box.spawnZ);
    box.group.rotation.set(0, 0, 0);
    box.group.scale.setScalar(1);
    box.group.visible = true;
  }

  clear(): void {
    for (const box of this.boxes) {
      HarvestingBoxOutlineFx.detach(box.group);
    }
    HarvestingBoxOutlineFx.clear();
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]!);
    }
    this.boxes = [];
    this.ready = false;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
