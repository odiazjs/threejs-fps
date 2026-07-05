import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import {
  GROUND_SNAP,
  GRAVITY,
  JUMP_VELOCITY,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
} from './levelData.js';
import type { RaycastHit, PlayerPhysicsState } from './collision.js';
import type { MapCollisionDef } from './maps.js';
import type { BakedLevelCollisionData } from './levelMeshCollisionUtils.js';

const EPS = 1e-4;
const SKIN = 0.02;
const DEPENETRATE_ITERATIONS = 12;
const MAX_HORIZONTAL_STEP = PLAYER_HALF_WIDTH * 0.35;
const SWEPT_MOVE_SEARCH_ITERATIONS = 6;
const MAX_JUMP_HEIGHT = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY) + 0.5;

const _ray = new THREE.Ray();
const _push = new THREE.Vector3();
const _point = new THREE.Vector3();
const _playerBox = new THREE.Box3();
const _identity = new THREE.Matrix4();
const _down = new THREE.Vector3(0, -1, 0);
const _up = new THREE.Vector3(0, 1, 0);

/** Shared mesh BVH collision — used by client (runtime geometry) and server (baked geometry). */
export class MergedMeshBvhCollision {
  private bvh: MeshBVH | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private ownsGeometry = false;

  get isReady(): boolean {
    return this.bvh !== null;
  }

  setGeometry(geometry: THREE.BufferGeometry, takeOwnership = true): void {
    this.clearGeometry();
    this.geometry = geometry;
    this.ownsGeometry = takeOwnership;
    this.bvh = new MeshBVH(geometry);
  }

  loadFromBake(data: BakedLevelCollisionData): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    this.setGeometry(geometry, true);
  }

  clear(): void {
    this.clearGeometry();
  }

  dispose(): void {
    this.clear();
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
    if (!this.bvh) return null;

    _ray.origin.set(ox, oy, oz);
    _ray.direction.set(dx, dy, dz).normalize();

    const hit = this.bvh.raycastFirst(_ray, undefined, minDistance, maxDistance);
    if (!hit) return null;

    return {
      x: hit.point.x,
      y: hit.point.y,
      z: hit.point.z,
      distance: hit.distance,
    };
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
    if (!this.bvh) {
      throw new Error('[MergedMeshBvh] stepPlayerPhysics called before BVH is ready');
    }

    let { verticalVelocity, grounded } = state;

    if (jump && grounded) {
      verticalVelocity = JUMP_VELOCITY;
      grounded = false;
    }

    verticalVelocity -= GRAVITY * delta;
    let nextFeetY = feetY + verticalVelocity * delta;
    nextFeetY = this.resolveCeiling(feetX, feetY, feetZ, nextFeetY);

    const ground = this.getGroundHeight(feetX, feetZ, feetY, map);
    if (nextFeetY <= ground) {
      nextFeetY = ground;
      verticalVelocity = 0;
      grounded = true;
    } else {
      grounded = false;
    }

    const horizontal = this.movePlayer(feetX, nextFeetY, feetZ, deltaX, deltaZ, map);
    const groundAfter = this.getGroundHeight(horizontal.x, horizontal.z, nextFeetY, map);

    if (nextFeetY <= groundAfter + GROUND_SNAP && verticalVelocity <= 0) {
      nextFeetY = groundAfter;
      verticalVelocity = 0;
      grounded = true;
    }

    return {
      x: horizontal.x,
      y: nextFeetY,
      z: horizontal.z,
      state: { verticalVelocity, grounded },
    };
  }

  movePlayer(
    feetX: number,
    feetY: number,
    feetZ: number,
    deltaX: number,
    deltaZ: number,
    map: MapCollisionDef,
  ): { x: number; y: number; z: number } {
    if (!this.bvh) {
      throw new Error('[MergedMeshBvh] movePlayer called before BVH is ready');
    }

    let x = feetX;
    let z = feetZ;
    const moveLen = Math.hypot(deltaX, deltaZ);
    if (moveLen < EPS) {
      return { x, y: feetY, z };
    }

    const steps = Math.max(1, Math.ceil(moveLen / MAX_HORIZONTAL_STEP));
    const stepX = deltaX / steps;
    const stepZ = deltaZ / steps;

    for (let i = 0; i < steps; i++) {
      ({ x, z } = this.tryMoveAxis(x, feetY, z, stepX, 'x'));
      ({ x, z } = this.tryMoveAxis(x, feetY, z, stepZ, 'z'));
    }

    const bounded = this.clampToMapBounds(x, z, map);
    return { x: bounded.x, y: feetY, z: bounded.z };
  }

  getGroundHeight(
    feetX: number,
    feetZ: number,
    feetY: number,
    map: MapCollisionDef,
  ): number {
    if (!this.bvh) return map.sampleGroundHeight(feetX, feetZ);

    let ground = map.sampleGroundHeight(feetX, feetZ);

    _ray.origin.set(feetX, feetY + PLAYER_HEIGHT + 0.25, feetZ);
    _ray.direction.copy(_down);
    const hit = this.bvh.raycastFirst(_ray, undefined, 0, MAX_JUMP_HEIGHT + PLAYER_HEIGHT + 1);
    if (hit && hit.point.y <= feetY + GROUND_SNAP) {
      ground = Math.max(ground, hit.point.y);
    }

    return ground;
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
    const feetY = eyeY - standEyeHeight;
    const ground = this.getGroundHeight(feetX, feetZ, feetY, map);
    const minEyeHeight = crouching ? crouchEyeHeight : standEyeHeight;
    const minEyeY = ground + minEyeHeight;
    const maxEyeY = ground + standEyeHeight + MAX_JUMP_HEIGHT;
    return Math.max(minEyeY, Math.min(eyeY, maxEyeY));
  }

  resolveMoveFeetY(
    feetX: number,
    feetZ: number,
    clientFeetY: number,
    map: MapCollisionDef,
  ): number {
    const ground = this.getGroundHeight(feetX, feetZ, clientFeetY, map);
    return Math.min(Math.max(clientFeetY, ground), ground + MAX_JUMP_HEIGHT);
  }

  isSpawnBlocked(feetX: number, feetZ: number, feetY = 0): boolean {
    if (!this.bvh) return false;
    return this.playerIntersectsMesh(feetX, feetY, feetZ);
  }

  private clearGeometry(): void {
    this.bvh = null;
    if (this.ownsGeometry) {
      this.geometry?.dispose();
    }
    this.geometry = null;
    this.ownsGeometry = false;
  }

  private resolveCeiling(
    feetX: number,
    feetY: number,
    feetZ: number,
    nextFeetY: number,
  ): number {
    if (!this.bvh || nextFeetY <= feetY) return nextFeetY;

    const nextHeadY = nextFeetY + PLAYER_HEIGHT;
    _ray.origin.set(feetX, feetY + PLAYER_HEIGHT - SKIN, feetZ);
    _ray.direction.copy(_up);
    const hit = this.bvh.raycastFirst(_ray, undefined, 0, nextHeadY - feetY + SKIN);
    if (!hit) return nextFeetY;

    return Math.min(nextFeetY, hit.point.y - PLAYER_HEIGHT - EPS);
  }

  private tryMoveAxis(
    feetX: number,
    feetY: number,
    feetZ: number,
    delta: number,
    axis: 'x' | 'z',
  ): { x: number; z: number } {
    if (Math.abs(delta) < EPS) {
      return { x: feetX, z: feetZ };
    }

    const targetX = axis === 'x' ? feetX + delta : feetX;
    const targetZ = axis === 'z' ? feetZ + delta : feetZ;

    if (!this.sweptPlayerIntersects(feetX, feetY, feetZ, targetX, feetY, targetZ)) {
      return this.depenetrateHorizontal(targetX, feetY, targetZ);
    }

    let lo = 0;
    let hi = 1;
    for (let i = 0; i < SWEPT_MOVE_SEARCH_ITERATIONS; i++) {
      const mid = (lo + hi) * 0.5;
      const midX = axis === 'x' ? feetX + delta * mid : feetX;
      const midZ = axis === 'z' ? feetZ + delta * mid : feetZ;
      if (this.sweptPlayerIntersects(feetX, feetY, feetZ, midX, feetY, midZ)) {
        hi = mid;
      } else {
        lo = mid;
      }
    }

    const safeX = axis === 'x' ? feetX + delta * lo : feetX;
    const safeZ = axis === 'z' ? feetZ + delta * lo : feetZ;
    return this.depenetrateHorizontal(safeX, feetY, safeZ);
  }

  private sweptPlayerIntersects(
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
  ): boolean {
    if (!this.bvh) return false;

    _playerBox.makeEmpty();
    this.expandPlayerBounds(_playerBox, fromX, fromY, fromZ);
    this.expandPlayerBounds(_playerBox, toX, toY, toZ);
    return this.bvh.intersectsBox(_playerBox, _identity);
  }

  private expandPlayerBounds(
    box: THREE.Box3,
    feetX: number,
    feetY: number,
    feetZ: number,
  ): void {
    box.expandByPoint(_point.set(feetX - PLAYER_HALF_WIDTH, feetY + SKIN, feetZ - PLAYER_HALF_WIDTH));
    box.expandByPoint(
      _point.set(feetX + PLAYER_HALF_WIDTH, feetY + PLAYER_HEIGHT - SKIN, feetZ + PLAYER_HALF_WIDTH),
    );
  }

  private depenetrateHorizontal(
    feetX: number,
    feetY: number,
    feetZ: number,
  ): { x: number; z: number } {
    if (!this.bvh) return { x: feetX, z: feetZ };

    let x = feetX;
    let z = feetZ;

    for (let iter = 0; iter < DEPENETRATE_ITERATIONS; iter++) {
      if (!this.playerIntersectsMesh(x, feetY, z)) break;

      let pushed = false;
      for (const sample of this.playerSamplePoints(x, feetY, z)) {
        const hit = this.bvh!.closestPointToPoint(sample);
        if (!hit || hit.distance >= SKIN) continue;

        _push.copy(sample).sub(hit.point);
        _push.y = 0;
        const len = _push.length();
        if (len < EPS) continue;

        _push.multiplyScalar((SKIN - hit.distance) / len);
        x += _push.x;
        z += _push.z;
        pushed = true;
      }

      if (!pushed) break;
    }

    return { x, z };
  }

  private playerIntersectsMesh(feetX: number, feetY: number, feetZ: number): boolean {
    this.setPlayerBox(feetX, feetY, feetZ);
    return this.bvh!.intersectsBox(_playerBox, _identity);
  }

  private setPlayerBox(feetX: number, feetY: number, feetZ: number): void {
    _playerBox.min.set(
      feetX - PLAYER_HALF_WIDTH,
      feetY + SKIN,
      feetZ - PLAYER_HALF_WIDTH,
    );
    _playerBox.max.set(
      feetX + PLAYER_HALF_WIDTH,
      feetY + PLAYER_HEIGHT - SKIN,
      feetZ + PLAYER_HALF_WIDTH,
    );
  }

  private *playerSamplePoints(feetX: number, feetY: number, feetZ: number): Generator<THREE.Vector3> {
    const yLevels = [feetY + SKIN, feetY + PLAYER_HEIGHT * 0.5, feetY + PLAYER_HEIGHT - SKIN];
    const xOffsets = [-PLAYER_HALF_WIDTH, 0, PLAYER_HALF_WIDTH];
    const zOffsets = [-PLAYER_HALF_WIDTH, 0, PLAYER_HALF_WIDTH];

    for (const y of yLevels) {
      for (const xo of xOffsets) {
        for (const zo of zOffsets) {
          _point.set(feetX + xo, y, feetZ + zo);
          yield _point;
        }
      }
    }
  }

  private clampToMapBounds(
    x: number,
    z: number,
    map: MapCollisionDef,
  ): { x: number; z: number } {
    const wallPad = map.wallThickness > 0 ? map.wallThickness : 0.5;
    const limitX = map.mapHalfX - PLAYER_HALF_WIDTH - wallPad;
    const limitZ = map.mapHalfZ - PLAYER_HALF_WIDTH - wallPad;
    return {
      x: Math.max(-limitX, Math.min(limitX, x)),
      z: Math.max(-limitZ, Math.min(limitZ, z)),
    };
  }
}
