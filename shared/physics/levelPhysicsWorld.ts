import {
  GROUND_SNAP,
  GRAVITY,
  JUMP_VELOCITY,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  type Aabb,
} from '../level/levelData.js';
import type { RaycastHit, PlayerPhysicsState } from '../level/collision.js';
import type { OrientedBoxCollider } from '../level/killhouseServerColliders.js';
import type { MapCollisionDef } from '../level/maps.js';
import {
  CAPSULE_HALF_HEIGHT,
  CAPSULE_RADIUS,
  capsuleCenterYToFeet,
  feetToCapsuleCenterY,
} from './capsuleConfig.js';
import { assertRapierReady, RAPIER } from './rapierInit.js';

const MAX_JUMP_HEIGHT = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY) + 0.5;
const MAX_SLOPE_RAD = (50 * Math.PI) / 180;
const IDENTITY_ROT = { w: 1, x: 0, y: 0, z: 0 };

/**
 * Rapier static world + kinematic character controller for player movement and raycasts.
 * One instance per map; client and server each hold their own copy with matching colliders.
 */
export class LevelPhysicsWorld {
  private world: RAPIER.World | null = null;
  private controller: RAPIER.KinematicCharacterController | null = null;
  private probeBody: RAPIER.RigidBody | null = null;
  private probeCollider: RAPIER.Collider | null = null;
  private bulletRay: RAPIER.Ray | null = null;
  private ready = false;

  get isReady(): boolean {
    return this.ready;
  }

  /** Probe collider handle — exclude from bullet/world raycasts. */
  get playerProbeCollider(): RAPIER.Collider | null {
    return this.probeCollider;
  }

  init(): void {
    assertRapierReady();
    this.dispose();

    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    this.probeBody = this.world.createRigidBody(bodyDesc);

    const capsuleDesc = RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS)
      .setFriction(0)
      .setRestitution(0);
    this.probeCollider = this.world.createCollider(capsuleDesc, this.probeBody);

    this.controller = this.world.createCharacterController(0.02);
    this.controller.setSlideEnabled(true);
    this.controller.enableAutostep(0.42, 0.2, true);
    this.controller.enableSnapToGround(0.45);
    this.controller.setMaxSlopeClimbAngle(MAX_SLOPE_RAD);
    this.controller.setMinSlopeSlideAngle((28 * Math.PI) / 180);

    this.bulletRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    this.ready = true;
  }

  loadAABBs(boxes: readonly Aabb[]): void {
    if (!this.world) throw new Error('[LevelPhysics] init() before loading colliders');

    for (const box of boxes) {
      const hx = (box.maxX - box.minX) * 0.5;
      const hy = (box.maxY - box.minY) * 0.5;
      const hz = (box.maxZ - box.minZ) * 0.5;
      const cx = (box.minX + box.maxX) * 0.5;
      const cy = (box.minY + box.maxY) * 0.5;
      const cz = (box.minZ + box.maxZ) * 0.5;

      const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(cx, cy, cz)
        .setFriction(0.6);
      this.world.createCollider(desc);
    }
  }

  loadOrientedBoxes(boxes: readonly OrientedBoxCollider[]): void {
    if (!this.world) throw new Error('[LevelPhysics] init() before loading colliders');

    for (const box of boxes) {
      const halfAngle = box.rotationY * 0.5;
      const desc = RAPIER.ColliderDesc.cuboid(box.halfX, box.halfY, box.halfZ)
        .setTranslation(box.centerX, box.centerY, box.centerZ)
        .setRotation({ w: Math.cos(halfAngle), x: 0, y: Math.sin(halfAngle), z: 0 })
        .setFriction(0.6);
      this.world.createCollider(desc);
    }
  }

  loadTrimesh(positions: Float32Array, indices: Uint32Array): void {
    if (!this.world) throw new Error('[LevelPhysics] init() before loading colliders');

    const desc = RAPIER.ColliderDesc.trimesh(positions, indices, RAPIER.TriMeshFlags.ORIENTED);
    this.world.createCollider(desc);
  }

  /** Flat ground slab — avoids thick floor-box trimesh panels in the arena interior. */
  loadGroundCuboid(halfExtentX: number, halfExtentZ: number, topY = 0, thickness = 0.02): void {
    if (!this.world) throw new Error('[LevelPhysics] init() before loading colliders');

    const halfY = thickness * 0.5;
    const desc = RAPIER.ColliderDesc.cuboid(halfExtentX, halfY, halfExtentZ)
      .setTranslation(0, topY - halfY, 0)
      .setFriction(0.6);
    this.world.createCollider(desc);
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
    if (!this.world) return null;

    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-8) return null;

    const ray = this.bulletRay ?? new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    ray.origin = { x: ox, y: oy, z: oz };
    ray.dir = { x: dx / len, y: dy / len, z: dz / len };

    const hit = this.world.castRay(
      ray,
      maxDistance,
      true,
      undefined,
      undefined,
      this.probeCollider ?? undefined,
    );

    if (!hit || hit.timeOfImpact < minDistance) return null;

    const point = ray.pointAt(hit.timeOfImpact);
    return {
      x: point.x,
      y: point.y,
      z: point.z,
      distance: hit.timeOfImpact,
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
    if (!this.ready) {
      throw new Error('[LevelPhysics] stepPlayerPhysics before world is ready');
    }

    let { verticalVelocity, grounded } = state;

    if (jump && grounded) {
      verticalVelocity = JUMP_VELOCITY;
      grounded = false;
    }

    verticalVelocity -= GRAVITY * delta;

    const moved = this.moveProbe(feetX, feetY, feetZ, deltaX, verticalVelocity * delta, deltaZ, map);
    let nextFeetY = moved.y;

    if (this.controller!.computedGrounded() && verticalVelocity <= 0) {
      verticalVelocity = 0;
      grounded = true;
      const groundY = this.getGroundHeight(moved.x, moved.z, nextFeetY, map);
      if (nextFeetY < groundY) nextFeetY = groundY;
    } else if (nextFeetY <= this.getGroundHeight(moved.x, moved.z, nextFeetY, map)) {
      verticalVelocity = 0;
      grounded = true;
      nextFeetY = this.getGroundHeight(moved.x, moved.z, nextFeetY, map);
    } else {
      grounded = false;
    }

    nextFeetY = this.resolveCeiling(moved.x, feetY, moved.z, nextFeetY);

    return {
      x: moved.x,
      y: nextFeetY,
      z: moved.z,
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
    if (!this.ready) {
      throw new Error('[LevelPhysics] movePlayer before world is ready');
    }

    const moved = this.moveProbe(feetX, feetY, feetZ, deltaX, 0, deltaZ, map);
    return { x: moved.x, y: feetY, z: moved.z };
  }

  getGroundHeight(
    feetX: number,
    feetZ: number,
    feetY: number,
    map: MapCollisionDef,
  ): number {
    if (!this.world) return map.sampleGroundHeight(feetX, feetZ);

    let ground = map.sampleGroundHeight(feetX, feetZ);
    const ray = new RAPIER.Ray(
      { x: feetX, y: feetY + PLAYER_HEIGHT + 0.5, z: feetZ },
      { x: 0, y: -1, z: 0 },
    );
    const hit = this.world.castRay(
      ray,
      MAX_JUMP_HEIGHT + PLAYER_HEIGHT + 1.5,
      true,
      undefined,
      undefined,
      this.probeCollider ?? undefined,
    );

    if (hit) {
      const y = ray.pointAt(hit.timeOfImpact).y;
      if (y <= feetY + GROUND_SNAP + 0.42) {
        ground = Math.max(ground, y);
      }
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
    const activeEyeHeight = crouching ? crouchEyeHeight : standEyeHeight;
    const feetY = eyeY - activeEyeHeight;
    const ground = this.getGroundHeight(feetX, feetZ, feetY, map);
    const minEyeY = ground + activeEyeHeight;
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
    if (!this.world) return false;

    const shape = new RAPIER.Capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS);
    const centerY = feetToCapsuleCenterY(feetY);
    const hit = this.world.intersectionWithShape(
      { x: feetX, y: centerY, z: feetZ },
      IDENTITY_ROT,
      shape,
    );
    return hit !== null;
  }

  dispose(): void {
    if (this.world) {
      this.world.free();
    }
    this.world = null;
    this.controller = null;
    this.probeBody = null;
    this.probeCollider = null;
    this.bulletRay = null;
    this.ready = false;
  }

  private moveProbe(
    feetX: number,
    feetY: number,
    feetZ: number,
    deltaX: number,
    deltaY: number,
    deltaZ: number,
    map: MapCollisionDef,
  ): { x: number; y: number; z: number } {
    if (!this.controller || !this.probeBody || !this.probeCollider || !this.world) {
      throw new Error('[LevelPhysics] moveProbe before world is ready');
    }

    this.setProbeFeet(feetX, feetY, feetZ);

    this.controller.computeColliderMovement(this.probeCollider, {
      x: deltaX,
      y: deltaY,
      z: deltaZ,
    });

    const movement = this.controller.computedMovement();
    const pos = this.probeBody.translation();
    this.probeBody.setNextKinematicTranslation({
      x: pos.x + movement.x,
      y: pos.y + movement.y,
      z: pos.z + movement.z,
    });
    this.world.step();

    const next = this.probeBody.translation();
    const bounded = this.clampToMapBounds(next.x, next.z, map);
    const nextFeetY = capsuleCenterYToFeet(next.y);
    this.setProbeFeet(bounded.x, nextFeetY, bounded.z);

    return { x: bounded.x, y: nextFeetY, z: bounded.z };
  }

  private setProbeFeet(feetX: number, feetY: number, feetZ: number): void {
    if (!this.probeBody) return;
    const y = feetToCapsuleCenterY(feetY);
    this.probeBody.setTranslation({ x: feetX, y, z: feetZ }, true);
  }

  private resolveCeiling(
    feetX: number,
    feetY: number,
    feetZ: number,
    nextFeetY: number,
  ): number {
    if (!this.world || nextFeetY <= feetY) return nextFeetY;

    const ray = new RAPIER.Ray(
      { x: feetX, y: feetY + PLAYER_HEIGHT - 0.02, z: feetZ },
      { x: 0, y: 1, z: 0 },
    );
    const hit = this.world.castRay(
      ray,
      nextFeetY + PLAYER_HEIGHT - feetY,
      true,
      undefined,
      undefined,
      this.probeCollider ?? undefined,
    );
    if (!hit) return nextFeetY;

    const headY = ray.pointAt(hit.timeOfImpact).y;
    return Math.min(nextFeetY, headY - PLAYER_HEIGHT - 1e-4);
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
