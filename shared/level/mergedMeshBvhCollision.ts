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
/** Contact offset — slightly larger for smoother corner rounding. */
const SKIN = 0.03;
/** Movement queries use a slightly narrower footprint so sharp mesh edges are more forgiving. */
const MOVE_HALF_WIDTH = PLAYER_HALF_WIDTH - 0.04;
const DEPENETRATE_ITERATIONS = 16;
const MAX_HORIZONTAL_STEP = PLAYER_HALF_WIDTH * 0.4;
const SWEPT_MOVE_SEARCH_ITERATIONS = 8;
const MAX_SLIDE_ITERATIONS = 4;
const STEP_HEIGHT = 0.38;
const MAX_JUMP_HEIGHT = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY) + 0.5;
const MAX_WALK_SLOPE = THREE.MathUtils.degToRad(50);
const WALKABLE_NORMAL_Y = Math.cos(MAX_WALK_SLOPE);

const _ray = new THREE.Ray();
const _push = new THREE.Vector3();
const _point = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _remaining = new THREE.Vector3();
const _actual = new THREE.Vector3();
const _groundNormal = new THREE.Vector3(0, 1, 0);
const _playerBox = new THREE.Box3();
const _identity = new THREE.Matrix4();
const _down = new THREE.Vector3(0, -1, 0);
const _up = new THREE.Vector3(0, 1, 0);

interface GroundInfo {
  height: number;
  normal: THREE.Vector3;
  walkable: boolean;
}

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
    const groundBefore = this.getGroundInfo(feetX, feetZ, feetY, map);

    let moveX = deltaX;
    let moveZ = deltaZ;
    if (grounded && groundBefore.walkable) {
      ({ x: moveX, z: moveZ } = this.projectOntoGroundPlane(deltaX, deltaZ, groundBefore.normal));
    }

    if (jump && grounded) {
      verticalVelocity = JUMP_VELOCITY;
      grounded = false;
    }

    verticalVelocity -= GRAVITY * delta;
    let nextFeetY = feetY + verticalVelocity * delta;
    nextFeetY = this.resolveCeiling(feetX, feetY, feetZ, nextFeetY);

    if (nextFeetY <= groundBefore.height) {
      nextFeetY = groundBefore.height;
      verticalVelocity = 0;
      grounded = true;
    } else {
      grounded = false;
    }

    const horizontal = this.movePlayer(feetX, nextFeetY, feetZ, moveX, moveZ, map);
    const groundAfter = this.getGroundInfo(horizontal.x, horizontal.z, nextFeetY, map);

    if (verticalVelocity <= 0) {
      const heightDelta = groundAfter.height - nextFeetY;
      if (
        heightDelta <= STEP_HEIGHT + GROUND_SNAP &&
        heightDelta >= -GROUND_SNAP * 2 &&
        groundAfter.walkable
      ) {
        nextFeetY = groundAfter.height;
        verticalVelocity = 0;
        grounded = true;
      } else if (nextFeetY <= groundAfter.height + GROUND_SNAP) {
        nextFeetY = groundAfter.height;
        verticalVelocity = 0;
        grounded = true;
      }
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

    ({ x, z } = this.depenetrateHorizontal(x, feetY, z));

    _remaining.set(deltaX, 0, deltaZ);

    for (let slide = 0; slide < MAX_SLIDE_ITERATIONS; slide++) {
      const remLen = _remaining.length();
      if (remLen < EPS) break;

      const beforeX = x;
      const beforeZ = z;

      const steps = Math.max(1, Math.ceil(remLen / MAX_HORIZONTAL_STEP));
      const stepX = _remaining.x / steps;
      const stepZ = _remaining.z / steps;

      for (let i = 0; i < steps; i++) {
        const moved = this.tryMoveWithStep(x, feetY, z, stepX, stepZ);
        x = moved.x;
        z = moved.z;
      }

      _actual.set(x - beforeX, 0, z - beforeZ);
      const movedLen = _actual.length();
      if (movedLen >= remLen - EPS) break;

      _remaining.sub(_actual);
      if (_remaining.lengthSq() < EPS) break;

      const wallNormal = this.probeWallNormal(x, feetY, z, _remaining.x, _remaining.z);
      if (wallNormal.lengthSq() < EPS) break;

      const slideDot = _remaining.dot(wallNormal);
      _remaining.addScaledVector(wallNormal, -slideDot);

      if (_remaining.length() >= remLen - EPS) break;
    }

    ({ x, z } = this.depenetrateHorizontal(x, feetY, z));

    const bounded = this.clampToMapBounds(x, z, map);
    return { x: bounded.x, y: feetY, z: bounded.z };
  }

  getGroundHeight(
    feetX: number,
    feetZ: number,
    feetY: number,
    map: MapCollisionDef,
  ): number {
    return this.getGroundInfo(feetX, feetZ, feetY, map).height;
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
    return this.playerIntersectsMesh(feetX, feetY, feetZ, PLAYER_HALF_WIDTH);
  }

  private clearGeometry(): void {
    this.bvh = null;
    if (this.ownsGeometry) {
      this.geometry?.dispose();
    }
    this.geometry = null;
    this.ownsGeometry = false;
  }

  private getGroundInfo(
    feetX: number,
    feetZ: number,
    feetY: number,
    map: MapCollisionDef,
  ): GroundInfo {
    let height = map.sampleGroundHeight(feetX, feetZ);
    _groundNormal.set(0, 1, 0);

    if (!this.bvh) {
      return { height, normal: _groundNormal.clone(), walkable: true };
    }

    _ray.origin.set(feetX, feetY + PLAYER_HEIGHT + 0.5, feetZ);
    _ray.direction.copy(_down);
    const hit = this.bvh.raycastFirst(_ray, undefined, 0, MAX_JUMP_HEIGHT + PLAYER_HEIGHT + 1.5);
    if (hit && hit.point.y <= feetY + GROUND_SNAP + STEP_HEIGHT) {
      height = Math.max(height, hit.point.y);
      if (hit.face?.normal) {
        _groundNormal.copy(hit.face.normal);
      }
    }

    const walkable = _groundNormal.y >= WALKABLE_NORMAL_Y;
    return { height, normal: _groundNormal.clone(), walkable };
  }

  private projectOntoGroundPlane(
    deltaX: number,
    deltaZ: number,
    normal: THREE.Vector3,
  ): { x: number; z: number } {
    _moveDir.set(deltaX, 0, deltaZ);
    if (_moveDir.lengthSq() < EPS) {
      return { x: 0, z: 0 };
    }

    _moveDir.projectOnPlane(normal);
    return { x: _moveDir.x, z: _moveDir.z };
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

  private tryMoveWithStep(
    feetX: number,
    feetY: number,
    feetZ: number,
    deltaX: number,
    deltaZ: number,
  ): { x: number; z: number } {
    const direct = this.tryMoveDirection(feetX, feetY, feetZ, deltaX, deltaZ);
    if (direct.fraction >= 1 - EPS) {
      return this.depenetrateHorizontal(direct.x, feetY, direct.z);
    }

    const elevated = this.tryMoveDirection(feetX, feetY + STEP_HEIGHT, feetZ, deltaX, deltaZ);
    if (elevated.fraction > direct.fraction + EPS) {
      const depenetrated = this.depenetrateHorizontal(elevated.x, feetY + STEP_HEIGHT, elevated.z);
      if (!this.playerIntersectsMesh(depenetrated.x, feetY, depenetrated.z, MOVE_HALF_WIDTH)) {
        return depenetrated;
      }
    }

    return this.depenetrateHorizontal(direct.x, feetY, direct.z);
  }

  private tryMoveDirection(
    feetX: number,
    feetY: number,
    feetZ: number,
    deltaX: number,
    deltaZ: number,
  ): { x: number; z: number; fraction: number } {
    const len = Math.hypot(deltaX, deltaZ);
    if (len < EPS) {
      return { x: feetX, z: feetZ, fraction: 1 };
    }

    if (!this.sweptPlayerIntersects(feetX, feetY, feetZ, feetX + deltaX, feetY, feetZ + deltaZ)) {
      return { x: feetX + deltaX, z: feetZ + deltaZ, fraction: 1 };
    }

    let lo = 0;
    let hi = 1;
    for (let i = 0; i < SWEPT_MOVE_SEARCH_ITERATIONS; i++) {
      const mid = (lo + hi) * 0.5;
      const midX = feetX + deltaX * mid;
      const midZ = feetZ + deltaZ * mid;
      if (this.sweptPlayerIntersects(feetX, feetY, feetZ, midX, feetY, midZ)) {
        hi = mid;
      } else {
        lo = mid;
      }
    }

    return {
      x: feetX + deltaX * lo,
      z: feetZ + deltaZ * lo,
      fraction: lo,
    };
  }

  private probeWallNormal(
    feetX: number,
    feetY: number,
    feetZ: number,
    dirX: number,
    dirZ: number,
  ): THREE.Vector3 {
    if (!this.bvh) return _normal.set(0, 0, 0);

    const len = Math.hypot(dirX, dirZ);
    if (len < EPS) return _normal.set(0, 0, 0);

    _moveDir.set(dirX / len, 0, dirZ / len);
    _ray.origin.set(feetX, feetY + PLAYER_HEIGHT * 0.45, feetZ);
    _ray.direction.copy(_moveDir);

    const hit = this.bvh.raycastFirst(
      _ray,
      undefined,
      MOVE_HALF_WIDTH * 0.5,
      MOVE_HALF_WIDTH + 0.6,
    );
    if (!hit?.face?.normal) {
      return _normal.set(0, 0, 0);
    }

    _normal.copy(hit.face.normal);
    _normal.y = 0;
    if (_normal.lengthSq() < EPS) {
      return _normal.set(0, 0, 0);
    }

    return _normal.normalize();
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
    this.expandPlayerBounds(_playerBox, fromX, fromY, fromZ, MOVE_HALF_WIDTH);
    this.expandPlayerBounds(_playerBox, toX, toY, toZ, MOVE_HALF_WIDTH);
    return this.bvh.intersectsBox(_playerBox, _identity);
  }

  private expandPlayerBounds(
    box: THREE.Box3,
    feetX: number,
    feetY: number,
    feetZ: number,
    halfWidth = MOVE_HALF_WIDTH,
  ): void {
    box.expandByPoint(_point.set(feetX - halfWidth, feetY + SKIN, feetZ - halfWidth));
    box.expandByPoint(
      _point.set(feetX + halfWidth, feetY + PLAYER_HEIGHT - SKIN, feetZ + halfWidth),
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
      if (!this.playerIntersectsMesh(x, feetY, z, MOVE_HALF_WIDTH)) break;

      let pushed = false;
      for (const sample of this.playerSamplePoints(x, feetY, z, MOVE_HALF_WIDTH)) {
        const hit = this.bvh!.closestPointToPoint(sample);
        if (!hit || hit.distance >= SKIN) continue;

        _push.copy(sample).sub(hit.point);
        _push.y = 0;

        const len = _push.length();
        if (len < EPS) continue;

        _push.multiplyScalar((SKIN - hit.distance + EPS) / len);
        x += _push.x;
        z += _push.z;
        pushed = true;
      }

      if (!pushed) break;
    }

    return { x, z };
  }

  private playerIntersectsMesh(
    feetX: number,
    feetY: number,
    feetZ: number,
    halfWidth = MOVE_HALF_WIDTH,
  ): boolean {
    this.setPlayerBox(feetX, feetY, feetZ, halfWidth);
    return this.bvh!.intersectsBox(_playerBox, _identity);
  }

  private setPlayerBox(
    feetX: number,
    feetY: number,
    feetZ: number,
    halfWidth = MOVE_HALF_WIDTH,
  ): void {
    _playerBox.min.set(
      feetX - halfWidth,
      feetY + SKIN,
      feetZ - halfWidth,
    );
    _playerBox.max.set(
      feetX + halfWidth,
      feetY + PLAYER_HEIGHT - SKIN,
      feetZ + halfWidth,
    );
  }

  private *playerSamplePoints(
    feetX: number,
    feetY: number,
    feetZ: number,
    halfWidth = MOVE_HALF_WIDTH,
  ): Generator<THREE.Vector3> {
    const yLevels = [feetY + SKIN, feetY + PLAYER_HEIGHT * 0.45, feetY + PLAYER_HEIGHT - SKIN];
    const offsets = [-halfWidth, 0, halfWidth];

    for (const y of yLevels) {
      for (const xo of offsets) {
        for (const zo of offsets) {
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
