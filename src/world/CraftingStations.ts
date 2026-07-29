import * as THREE from 'three';
import {
  CRAFTING_STATION_INTERACT_DISTANCE,
} from '../../shared/content/craftingCatalog';
import {
  buildCraftingStationColliders,
  CRAFTING_STATION_FRONT_OFFSET,
  type CraftingStationSpawn,
} from '../../shared/level/craftingStationSpawns';
import type { OrientedBoxCollider } from '../../shared/level/killhouseServerColliders';
import {
  createCraftingStationMesh,
  getCraftingStationHalfExtents,
} from './craftingStationVisual';

export interface CraftingStationInstance {
  readonly index: number;
  readonly spawn: CraftingStationSpawn;
  readonly group: THREE.Group;
  /** World-space front interact anchor. */
  readonly interactX: number;
  readonly interactZ: number;
  readonly forwardX: number;
  readonly forwardZ: number;
}

export class CraftingStations {
  readonly group = new THREE.Group();
  private stations: CraftingStationInstance[] = [];
  private ready = false;

  constructor(private readonly scene: THREE.Scene) {
    this.group.name = 'craftingStations';
    this.scene.add(this.group);
  }

  async load(spawns: readonly CraftingStationSpawn[]): Promise<void> {
    this.clear();
    if (spawns.length === 0) {
      this.ready = true;
      return;
    }

    const instances: CraftingStationInstance[] = [];
    for (let i = 0; i < spawns.length; i++) {
      const marker = spawns[i]!;
      const mesh = await createCraftingStationMesh();
      const root = new THREE.Group();
      root.name = `craftingStation_${i}`;
      // Marker pivots are mid-prop; place feet on the ground at marker xz.
      root.position.set(marker.x, 0, marker.z);
      root.rotation.y = marker.yaw;
      root.add(mesh);
      this.group.add(root);

      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      if (Number.isFinite(box.min.y)) {
        root.position.y -= box.min.y;
        root.updateMatrixWorld(true);
      }

      const spawn: CraftingStationSpawn = {
        x: root.position.x,
        y: root.position.y,
        z: root.position.z,
        yaw: marker.yaw,
      };

      const forwardX = Math.sin(spawn.yaw);
      const forwardZ = Math.cos(spawn.yaw);
      instances.push({
        index: i,
        spawn,
        group: root,
        interactX: spawn.x + forwardX * CRAFTING_STATION_FRONT_OFFSET,
        interactZ: spawn.z + forwardZ * CRAFTING_STATION_FRONT_OFFSET,
        forwardX,
        forwardZ,
      });
    }

    this.stations = instances;
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  getStations(): readonly CraftingStationInstance[] {
    return this.stations;
  }

  getCollisionBoxes(): OrientedBoxCollider[] {
    if (this.stations.length === 0) return [];
    const half = getCraftingStationHalfExtents();
    return buildCraftingStationColliders(
      this.stations.map((station) => station.spawn),
      half,
    );
  }

  /**
   * Nearest station the player can use: within range of the front interact point
   * and standing on the front side of the station.
   */
  findInteractable(
    playerX: number,
    playerZ: number,
  ): CraftingStationInstance | null {
    let best: CraftingStationInstance | null = null;
    let bestDist = Infinity;

    for (const station of this.stations) {
      const dx = playerX - station.interactX;
      const dz = playerZ - station.interactZ;
      const dist = Math.hypot(dx, dz);
      if (dist > CRAFTING_STATION_INTERACT_DISTANCE) continue;

      const toPlayerX = playerX - station.spawn.x;
      const toPlayerZ = playerZ - station.spawn.z;
      const facing =
        toPlayerX * station.forwardX + toPlayerZ * station.forwardZ;
      if (facing < 0.05) continue;

      if (dist < bestDist) {
        bestDist = dist;
        best = station;
      }
    }

    return best;
  }

  clear(): void {
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]!);
    }
    this.stations = [];
    this.ready = false;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
