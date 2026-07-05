import * as THREE from 'three';
import type { RaycastHit, PlayerPhysicsState } from '../../shared/level/collision';
import type { MapCollisionDef } from '../../shared/level/maps';
import { MergedMeshBvhCollision } from '../../shared/level/mergedMeshBvhCollision';
import { buildMergedLevelCollisionGeometry, collectLevelCollisionMeshes } from './levelMeshUtils';
import {
  attachMeshBvhColliderDebugGeometry,
  disposeMeshBvhColliderDebugMesh,
  isMeshBvhColliderDebugEnabled,
} from '../debug/MeshBvhColliderDebugMesh';

/** Client runtime mesh BVH for bullets and player movement on Chrono-Bowl. */
export class LevelMeshBvhCollision {
  private readonly collision = new MergedMeshBvhCollision();
  private debugRoot: THREE.Object3D | null = null;
  private debugGeometry: THREE.BufferGeometry | null = null;

  get isReady(): boolean {
    return this.collision.isReady;
  }

  rebuild(roots: readonly THREE.Object3D[], debugParent?: THREE.Object3D): void {
    this.clear();

    const meshes = collectLevelCollisionMeshes(roots);
    if (meshes.length === 0) {
      console.warn('[LevelMeshBvh] No meshes found for level BVH');
      return;
    }

    try {
      const geometry = buildMergedLevelCollisionGeometry(meshes);
      this.collision.setGeometry(geometry, true);
      const triangleCount =
        (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      console.info(
        `[LevelMeshBvh] Built level BVH from ${meshes.length} meshes (${Math.round(triangleCount)} tris)`,
      );

      if (debugParent && isMeshBvhColliderDebugEnabled()) {
        this.debugGeometry = geometry.clone();
        this.debugRoot = attachMeshBvhColliderDebugGeometry(debugParent, this.debugGeometry);
      }
    } catch (error) {
      console.error('[LevelMeshBvh] Failed to build BVH geometry', error);
      throw error;
    }
  }

  attachColliderDebug(parent: THREE.Object3D): void {
    this.detachColliderDebug();
    if (!isMeshBvhColliderDebugEnabled() || !this.debugGeometry) return;
    this.debugRoot = attachMeshBvhColliderDebugGeometry(parent, this.debugGeometry);
  }

  detachColliderDebug(): void {
    if (!this.debugRoot) return;
    disposeMeshBvhColliderDebugMesh(this.debugRoot);
    this.debugRoot = null;
    this.debugGeometry?.dispose();
    this.debugGeometry = null;
  }

  clear(): void {
    this.detachColliderDebug();
    this.collision.clear();
  }

  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDistance: number,
    minDistance = 0,
  ): RaycastHit | null {
    return this.collision.raycast(ox, oy, oz, dx, dy, dz, maxDistance, minDistance);
  }

  stepPlayerPhysics(
    feetX: number,
    feetY: number,
    feetZ: number,
    state: PlayerPhysicsState,
    deltaX: number,
    deltaZ: number,
    jump: boolean,
    delta: number,
    map: MapCollisionDef,
  ): { x: number; y: number; z: number; state: PlayerPhysicsState } {
    return this.collision.stepPlayerPhysics(
      feetX,
      feetY,
      feetZ,
      state,
      deltaX,
      deltaZ,
      jump,
      delta,
      map,
    );
  }

  movePlayer(
    feetX: number,
    feetY: number,
    feetZ: number,
    deltaX: number,
    deltaZ: number,
    map: MapCollisionDef,
  ): { x: number; y: number; z: number } {
    return this.collision.movePlayer(feetX, feetY, feetZ, deltaX, deltaZ, map);
  }

  getGroundHeight(
    feetX: number,
    feetZ: number,
    feetY: number,
    map: MapCollisionDef,
  ): number {
    return this.collision.getGroundHeight(feetX, feetZ, feetY, map);
  }

  clampEyeY(
    feetX: number,
    feetZ: number,
    eyeY: number,
    map: MapCollisionDef,
    crouching: boolean,
    standEyeHeight: number,
    crouchEyeHeight: number,
  ): number {
    return this.collision.clampEyeY(
      feetX,
      feetZ,
      eyeY,
      map,
      crouching,
      standEyeHeight,
      crouchEyeHeight,
    );
  }

  dispose(): void {
    this.clear();
  }
}
