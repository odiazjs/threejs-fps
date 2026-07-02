import * as THREE from 'three';
import { SHIELD_PICKUP_MAX_DISTANCE } from '../../shared/network/shieldPickup';
import { getClientMapDef } from '../../shared/level/maps';
import type { ShieldChargeSnapshot } from '../network/types';
import { createShieldChargePickup } from './shieldChargeVisual';

export interface ShieldChargeRaycastHit {
  index: number;
  distance: number;
}

const _raycaster = new THREE.Raycaster();

export class ShieldChargePickups {
  private readonly root: THREE.Group;
  private readonly pickups = new Map<number, THREE.Group>();
  private readonly snapshots = new Map<number, ShieldChargeSnapshot>();

  constructor(scene: THREE.Scene) {
    this.root = new THREE.Group();
    this.root.name = 'shield-charge-pickups';
    scene.add(this.root);
  }

  applySnapshot(index: number, snapshot: ShieldChargeSnapshot): void {
    if (snapshot.collected) {
      this.removePickup(index);
      return;
    }

    this.snapshots.set(index, snapshot);

    let pickup = this.pickups.get(index);
    if (!pickup) {
      pickup = createShieldChargePickup();
      pickup.userData.shieldChargeIndex = index;
      this.pickups.set(index, pickup);
      this.root.add(pickup);
    }

    const groundY = getClientMapDef().sampleGroundHeight(snapshot.x, snapshot.z);
    pickup.position.set(snapshot.x, groundY, snapshot.z);
    pickup.visible = true;
  }

  raycastFromCamera(
    camera: THREE.Camera,
    maxDistance = SHIELD_PICKUP_MAX_DISTANCE,
  ): ShieldChargeRaycastHit | null {
    _raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const meshes: THREE.Object3D[] = [];
    for (const pickup of this.pickups.values()) {
      pickup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshes.push(child);
        }
      });
    }

    if (meshes.length === 0) return null;

    const hits = _raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      if (hit.distance > maxDistance) continue;

      let node: THREE.Object3D | null = hit.object;
      while (node && node !== this.root) {
        const index = node.userData.shieldChargeIndex as number | undefined;
        if (index !== undefined) {
          const snapshot = this.snapshots.get(index);
          if (!snapshot || snapshot.collected) return null;
          return {
            index,
            distance: hit.distance,
          };
        }
        node = node.parent;
      }
    }

    return null;
  }

  private removePickup(index: number): void {
    this.snapshots.delete(index);

    const pickup = this.pickups.get(index);
    if (!pickup) return;

    pickup.removeFromParent();
    pickup.traverse((child) => {
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
    this.pickups.delete(index);
  }
}
