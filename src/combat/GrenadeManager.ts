import * as THREE from 'three';
import type { GrenadeThrowBroadcast } from '../../shared/network/grenade';
import { GRENADE_FUSE_SEC } from '../../shared/throwables/grenadeConfig';
import {
  createGrenadeMotionState,
  stepGrenadeMotion,
  type GrenadeMotionState,
} from '../../shared/combat/grenadePhysics';
import { createGrenadeWorldRaycast } from '../../shared/combat/grenadeWorldCollision';
import { getClientMapDef } from '../../shared/level/maps';
import { createGrenadeMesh, disposeGrenadeObject, loadGrenadeTemplate } from '../content/grenadeModel';
import { ExplosionFx } from '../effects/ExplosionFx';
import { GrenadeFuseFx } from '../effects/GrenadeFuseFx';
import type { GrenadeSoundService } from '../audio/GrenadeSoundService';
import type { ShieldDomeManager } from './ShieldDomeManager';

interface ActiveGrenade extends GrenadeMotionState {
  id: string;
  fuseEndAt: number;
  object: THREE.Group;
  fuseFx: GrenadeFuseFx;
  lastFuseTick: number;
  restQuaternion: THREE.Quaternion;
  hasRestPose: boolean;
  lastBounceSoundAt: number;
  /** True for grenades this client threw — it owns their flight + detonation. */
  isOwn: boolean;
  /** Set on non-owned grenades once the fuse elapses while awaiting the relay. */
  fallbackDetonateAt?: number;
}

type ExplosionListener = (x: number, y: number, z: number) => void;
type DetonateReporter = (id: string, x: number, y: number, z: number) => void;

const BOUNCE_SOUND_COOLDOWN_SEC = 0.07;

/**
 * For grenades thrown by *other* players this client waits this long after the
 * local fuse elapses for the server-relayed explosion (carrying the thrower's
 * authoritative position) before detonating at its own prediction as a safety
 * net for a dropped/absent relay.
 */
const RELAY_DETONATION_GRACE_MS = 400;

const _velocity = new THREE.Vector3();
const _tumbleAxis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _deltaQuat = new THREE.Quaternion();
const _restEuler = new THREE.Euler();

function sampleGround(x: number, z: number): number {
  return getClientMapDef().sampleGroundHeight(x, z);
}

function applySidewaysRestQuaternion(target: THREE.Quaternion): void {
  _restEuler.set(Math.PI * 0.5, Math.random() * Math.PI * 2, 0, 'XYZ');
  target.setFromEuler(_restEuler);
}

function updateGrenadeVisual(grenade: ActiveGrenade, delta: number): void {
  grenade.object.position.set(grenade.x, grenade.y, grenade.z);

  const speed = Math.hypot(grenade.velX, grenade.velY, grenade.velZ);

  if (grenade.grounded) {
    if (!grenade.hasRestPose) {
      applySidewaysRestQuaternion(grenade.restQuaternion);
      grenade.hasRestPose = true;
    }
    grenade.object.quaternion.slerp(
      grenade.restQuaternion,
      1 - Math.exp(-14 * delta),
    );
    return;
  }

  _velocity.set(grenade.velX, grenade.velY, grenade.velZ);
  if (_velocity.lengthSq() <= 1e-6) return;
  _velocity.normalize();

  _tumbleAxis.crossVectors(_velocity, _up);
  if (_tumbleAxis.lengthSq() < 1e-6) {
    _tumbleAxis.set(1, 0, 0);
  } else {
    _tumbleAxis.normalize();
  }

  const rollSpeed = speed * delta * 3.4;
  _deltaQuat.setFromAxisAngle(_tumbleAxis, rollSpeed);
  grenade.object.quaternion.premultiply(_deltaQuat);
}

function updateFuseTicks(grenade: ActiveGrenade, worldTime: number): void {
  const remaining = grenade.fuseEndAt - worldTime;
  if (remaining <= 0) return;

  const tickBucket = Math.ceil(Math.max(0, remaining - 0.001));
  if (
    tickBucket === grenade.lastFuseTick ||
    tickBucket <= 0 ||
    tickBucket > GRENADE_FUSE_SEC
  ) {
    return;
  }

  grenade.fuseFx.pulse(tickBucket);
  grenade.lastFuseTick = tickBucket;
}

export class GrenadeManager {
  private readonly root = new THREE.Group();
  private readonly grenades = new Map<string, ActiveGrenade>();
  private readonly detonatedIds = new Set<string>();
  private readonly explosionFx: ExplosionFx;
  private explosionListener: ExplosionListener | null = null;
  private detonateReporter: DetonateReporter | null = null;
  private grenadeSounds: GrenadeSoundService | null = null;
  private shieldDomeManager: ShieldDomeManager | null = null;
  private grenadeIdCounter = 0;
  readonly whenReady: Promise<void>;

  constructor(scene: THREE.Scene) {
    this.root.name = 'grenades';
    scene.add(this.root);
    this.explosionFx = new ExplosionFx();
    scene.add(this.explosionFx.object);
    this.whenReady = loadGrenadeTemplate().then(() => undefined);
  }

  setExplosionListener(listener: ExplosionListener | null): void {
    this.explosionListener = listener;
  }

  /** Reports the authoritative detonation position of an owned grenade to the server. */
  setDetonateReporter(reporter: DetonateReporter | null): void {
    this.detonateReporter = reporter;
  }

  setGrenadeSoundService(service: GrenadeSoundService | null): void {
    this.grenadeSounds = service;
  }

  setShieldDomeManager(manager: ShieldDomeManager | null): void {
    this.shieldDomeManager = manager;
  }

  spawnLocalThrow(
    _throwerId: string,
    x: number,
    y: number,
    z: number,
    velX: number,
    velY: number,
    velZ: number,
    fuseEndAt: number,
  ): string {
    const id = `local-${++this.grenadeIdCounter}`;
    void this.addGrenade(id, x, y, z, velX, velY, velZ, fuseEndAt, true);
    return id;
  }

  reconcileLocalThrow(data: GrenadeThrowBroadcast): void {
    for (const [id, grenade] of this.grenades) {
      if (!id.startsWith('local-')) continue;

      this.grenades.delete(id);
      grenade.id = data.id;
      grenade.x = data.x;
      grenade.y = data.y;
      grenade.z = data.z;
      grenade.velX = data.velX;
      grenade.velY = data.velY;
      grenade.velZ = data.velZ;
      grenade.fuseEndAt = data.fuseEndAt;
      grenade.grounded = false;
      grenade.bounceCount = 0;
      grenade.hasRestPose = false;
      grenade.lastFuseTick = -1;
      grenade.lastBounceSoundAt = -1;
      grenade.isOwn = true;
      grenade.object.position.set(data.x, data.y, data.z);
      grenade.object.quaternion.identity();
      this.grenades.set(data.id, grenade);
      return;
    }

    // No local prediction to reconcile — still an owned throw, so spawn it owned.
    void this.addGrenade(
      data.id,
      data.x,
      data.y,
      data.z,
      data.velX,
      data.velY,
      data.velZ,
      data.fuseEndAt,
      true,
    );
  }

  spawnFromNetwork(data: GrenadeThrowBroadcast): void {
    if (this.grenades.has(data.id)) return;
    void this.addGrenade(
      data.id,
      data.x,
      data.y,
      data.z,
      data.velX,
      data.velY,
      data.velZ,
      data.fuseEndAt,
      false,
    );
  }

  detonateFromNetwork(x: number, y: number, z: number, grenadeId?: string): void {
    if (grenadeId) {
      if (this.detonatedIds.has(grenadeId)) return;
      this.detonatedIds.add(grenadeId);
      this.removeGrenade(grenadeId);
    }
    this.explosionFx.play(x, y, z);
    this.grenadeSounds?.playExplosion(x, y, z);
    this.explosionListener?.(x, y, z);
  }

  update(delta: number, worldTime: number): void {
    this.explosionFx.update(delta);
    const shieldDomes = this.shieldDomeManager?.getActiveDomesForPhysics(worldTime) ?? [];

    for (const [id, grenade] of this.grenades) {
      // Non-owned grenade whose fuse already elapsed: it is hidden and waiting
      // for the thrower's server-relayed explosion. Fall back to the local
      // prediction only if the relay never arrives.
      if (grenade.fallbackDetonateAt !== undefined) {
        if (performance.now() >= grenade.fallbackDetonateAt) {
          this.detonateFromNetwork(grenade.x, grenade.y, grenade.z, id);
        }
        continue;
      }

      const prevBounceCount = grenade.bounceCount;
      const prevSpeed = Math.hypot(grenade.velX, grenade.velY, grenade.velZ);

      stepGrenadeMotion(
        grenade,
        delta,
        sampleGround,
        createGrenadeWorldRaycast(),
        shieldDomes,
        worldTime,
      );

      if (
        grenade.bounceCount > prevBounceCount &&
        worldTime - grenade.lastBounceSoundAt >= BOUNCE_SOUND_COOLDOWN_SEC
      ) {
        grenade.lastBounceSoundAt = worldTime;
        this.grenadeSounds?.playBounce(grenade.x, grenade.y, grenade.z, prevSpeed);
        grenade.hasRestPose = false;
      }

      updateGrenadeVisual(grenade, delta);
      updateFuseTicks(grenade, worldTime);
      grenade.fuseFx.update(delta, grenade.fuseEndAt, worldTime);

      if (worldTime >= grenade.fuseEndAt) {
        if (grenade.isOwn) {
          // This client owns the grenade: detonate at the position it simulated
          // (matching what the player saw), and report it so the server applies
          // the blast damage there and relays the explosion to everyone else.
          this.detonateReporter?.(id, grenade.x, grenade.y, grenade.z);
          this.detonateFromNetwork(grenade.x, grenade.y, grenade.z, id);
        } else {
          grenade.object.visible = false;
          grenade.fallbackDetonateAt = performance.now() + RELAY_DETONATION_GRACE_MS;
        }
      }
    }
  }

  private async addGrenade(
    id: string,
    x: number,
    y: number,
    z: number,
    velX: number,
    velY: number,
    velZ: number,
    fuseEndAt: number,
    isOwn: boolean,
  ): Promise<void> {
    const object = await createGrenadeMesh();
    const fuseFx = new GrenadeFuseFx();
    object.position.set(x, y, z);
    object.quaternion.identity();
    object.add(fuseFx.object);
    this.root.add(object);

    this.grenades.set(id, {
      ...createGrenadeMotionState(x, y, z, velX, velY, velZ),
      id,
      fuseEndAt,
      object,
      fuseFx,
      lastFuseTick: -1,
      restQuaternion: new THREE.Quaternion(),
      hasRestPose: false,
      lastBounceSoundAt: -1,
      isOwn,
    });
  }

  private removeGrenade(id: string): void {
    const grenade = this.grenades.get(id);
    if (!grenade) return;
    grenade.fuseFx.dispose();
    disposeGrenadeObject(grenade.object);
    grenade.object.removeFromParent();
    this.grenades.delete(id);
  }

  dispose(): void {
    for (const id of [...this.grenades.keys()]) {
      this.removeGrenade(id);
    }
    this.explosionFx.dispose();
    this.root.removeFromParent();
  }
}
