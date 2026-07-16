import * as THREE from 'three';
import { WEAPON_PICKUP_AIM_MAX_DISTANCE, WEAPON_PICKUP_MAX_DISTANCE } from '../../shared/network/weaponPickup';
import { isPickableWeaponId } from '../../shared/content/weaponIds';
import type { WeaponDropSnapshot } from '../network/types';
import { createWeaponDropMesh } from './weaponDropVisual';
import { resolvePickupPlacementY } from './pickupSurface';

export interface WeaponDropRaycastHit {
  index: number;
  weaponId: string;
  distance: number;
  x: number;
  z: number;
}

const _raycaster = new THREE.Raycaster();

export class WeaponDrops {
  private readonly root: THREE.Group;
  private readonly drops = new Map<number, THREE.Group>();
  private readonly snapshots = new Map<number, WeaponDropSnapshot>();

  constructor(scene: THREE.Scene) {
    this.root = new THREE.Group();
    this.root.name = 'weapon-drops';
    scene.add(this.root);
  }

  applySnapshot(index: number, snapshot: WeaponDropSnapshot): void {
    if (snapshot.collected) {
      this.removeDrop(index);
      return;
    }

    this.snapshots.set(index, snapshot);

    let drop = this.drops.get(index);
    if (!drop) {
      drop = createWeaponDropMesh(snapshot.weaponId);
      drop.userData.weaponDropIndex = index;
      this.drops.set(index, drop);
      this.root.add(drop);
    }

    const groundY = resolvePickupPlacementY(snapshot.x, snapshot.z, snapshot.y);
    drop.position.set(snapshot.x, groundY, snapshot.z);
    drop.rotation.y = snapshot.yaw;
  }

  /**
   * Aim-ray hit against a drop that is also within feet pickup range.
   * Matches the server's horizontal feet-distance check so the hold spinner
   * cannot complete for a pickup the server will reject.
   */
  raycastFromCamera(
    camera: THREE.Camera,
    feetX: number,
    feetZ: number,
    aimMaxDistance = WEAPON_PICKUP_AIM_MAX_DISTANCE,
    feetMaxDistance = WEAPON_PICKUP_MAX_DISTANCE,
  ): WeaponDropRaycastHit | null {
    _raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const meshes: THREE.Object3D[] = [];
    for (const drop of this.drops.values()) {
      drop.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshes.push(child);
        }
      });
    }

    if (meshes.length === 0) return null;

    const hits = _raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      if (hit.distance > aimMaxDistance) continue;

      let node: THREE.Object3D | null = hit.object;
      while (node && node !== this.root) {
        const index = node.userData.weaponDropIndex as number | undefined;
        if (index !== undefined) {
          const snapshot = this.snapshots.get(index);
          if (!snapshot || snapshot.collected) return null;
          if (!isPickableWeaponId(snapshot.weaponId)) return null;

          const feetDist = Math.hypot(feetX - snapshot.x, feetZ - snapshot.z);
          if (feetDist > feetMaxDistance) return null;

          return {
            index,
            weaponId: snapshot.weaponId,
            distance: hit.distance,
            x: snapshot.x,
            z: snapshot.z,
          };
        }
        node = node.parent;
      }
    }

    return null;
  }

  private removeDrop(index: number): void {
    this.snapshots.delete(index);

    const drop = this.drops.get(index);
    if (!drop) return;

    drop.removeFromParent();
    drop.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const material = child.material;
        if (Array.isArray(material)) {
          material.forEach((mat) => mat.dispose());
        } else {
          material.dispose();
        }
      }
    });
    this.drops.delete(index);
  }
}
