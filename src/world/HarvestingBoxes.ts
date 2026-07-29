import * as THREE from 'three';
import {
  HARVESTING_BOX_INTERACT_DISTANCE,
  harvestingBoxInstallSpot,
  harvestingBoxSurfaceY,
  type HarvestingBoxSpawn,
} from '../../shared/level/harvestingBoxSpawns';
import { HarvestingBoxOutlineFx } from '../effects/HarvestingBoxOutlineFx';
import { createHarvestingBoxMesh } from './harvestingBoxVisual';
import {
  createHarvestingBoxTeamArrow,
  pulseHarvestingBoxArrow,
  setHarvestingBoxArrowVisible,
} from './harvestingBoxMarker';
import {
  createHarvestInstallHologram,
  type HarvestInstallHologram,
} from './harvestInstallHologram';
import { resolvePickupPlacementY } from './pickupSurface';

export interface HarvestingBoxInstance {
  readonly index: number;
  readonly teamId: number;
  readonly group: THREE.Group;
  readonly arrow: THREE.Mesh;
  /** Immutable home marker (own-box spawn). */
  homeX: number;
  homeY: number;
  homeZ: number;
  /** Authored install marker on this team's base. */
  installX: number;
  installY: number;
  installZ: number;
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
  private installHolograms: HarvestInstallHologram[] = [];
  private ready = false;
  private elapsed = 0;

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
      const placeY = resolvePickupPlacementY(
        spawn.x,
        spawn.z,
        harvestingBoxSurfaceY(spawn.y),
      );
      root.position.set(spawn.x, placeY, spawn.z);
      root.add(mesh);
      const arrow = createHarvestingBoxTeamArrow(spawn.teamId);
      root.add(arrow);
      this.group.add(root);
      // Outline the crate mesh only ó keep the team arrow depth-tested.
      HarvestingBoxOutlineFx.attach(mesh, spawn.teamId);

      const installY = harvestingBoxSurfaceY(spawn.installY);
      instances.push({
        index: spawn.index,
        teamId: spawn.teamId,
        group: root,
        arrow,
        homeX: spawn.x,
        homeY: placeY,
        homeZ: spawn.z,
        installX: spawn.installX,
        installY,
        installZ: spawn.installZ,
        spawnX: spawn.x,
        spawnY: placeY,
        spawnZ: spawn.z,
        carriedBySessionId: '',
      });

      const spot = harvestingBoxInstallSpot(spawn.x, spawn.z, {
        x: spawn.installX,
        z: spawn.installZ,
      });
      const hologram = createHarvestInstallHologram(
        spawn.teamId,
        spot.x,
        resolvePickupPlacementY(spot.x, spot.z, installY),
        spot.z,
      );
      this.group.add(hologram.object);
      this.installHolograms.push(hologram);
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
    const spot = harvestingBoxInstallSpot(ownHome.homeX, ownHome.homeZ, {
      x: ownHome.installX,
      z: ownHome.installZ,
    });
    return (
      Math.hypot(playerX - spot.x, playerZ - spot.z) <=
      HARVESTING_BOX_INTERACT_DISTANCE
    );
  }

  /** Own-base install spot for a team (`base_install_box_pos`). */
  getInstallSpotForTeam(teamId: number): { x: number; z: number } | null {
    const ownHome = this.boxes.find((box) => box.teamId === teamId);
    if (!ownHome) return null;
    return harvestingBoxInstallSpot(ownHome.homeX, ownHome.homeZ, {
      x: ownHome.installX,
      z: ownHome.installZ,
    });
  }

  getInstallSurfaceYForTeam(teamId: number): number | null {
    const ownHome = this.boxes.find((box) => box.teamId === teamId);
    if (!ownHome) return null;
    return ownHome.installY;
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
      installX?: number;
      installY?: number;
      installZ?: number;
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
      if (typeof state.homeY === 'number' && state.homeY > 1e-3) {
        box.homeY = state.homeY;
      }
      if (typeof state.installX === 'number') box.installX = state.installX;
      if (typeof state.installZ === 'number') box.installZ = state.installZ;
      if (typeof state.installY === 'number' && state.installY > 1e-3) {
        box.installY = state.installY;
      }

      box.spawnY = this.resolveGroundY(box, state.x, state.y, state.z);

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
    delta?: number;
    /** Used to yaw install holograms toward the viewer. */
    viewCamera?: THREE.Camera | null;
  }): void {
    const { localSessionId, localCamera, getRemoteHand } = options;
    this.elapsed += options.delta ?? 0;

    for (const holo of this.installHolograms) {
      holo.update(this.elapsed, options.viewCamera ?? null);
    }

    for (const box of this.boxes) {
      const carrier = box.carriedBySessionId;
      if (!carrier) {
        this.parkOnGround(box);
        setHarvestingBoxArrowVisible(box.arrow, true);
        pulseHarvestingBoxArrow(box.arrow, this.elapsed);
        continue;
      }

      setHarvestingBoxArrowVisible(box.arrow, false);

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

  private resolveGroundY(
    box: HarvestingBoxInstance,
    x: number,
    y: number,
    z: number,
  ): number {
    // Installed at any team's install pad ù use that pad's authored surface Y.
    for (const other of this.boxes) {
      if (Math.hypot(x - other.installX, z - other.installZ) < 0.75) {
        return other.installY;
      }
    }
    if (Math.hypot(x - box.homeX, z - box.homeZ) < 0.75) {
      return box.homeY;
    }
    // Free drop: prefer server feet Y when present.
    if (y > 1e-3) return y;
    return box.homeY;
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
      box.group.traverse((child) => {
        HarvestingBoxOutlineFx.detach(child);
      });
      const mat = box.arrow.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else {
        mat.dispose();
      }
      box.arrow.geometry.dispose();
    }
    for (const holo of this.installHolograms) {
      holo.dispose();
    }
    this.installHolograms = [];
    HarvestingBoxOutlineFx.clear();
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]!);
    }
    this.boxes = [];
    this.ready = false;
    this.elapsed = 0;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
