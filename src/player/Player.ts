import * as THREE from 'three';
import { EYE_HEIGHT, stepPlayerPhysics, type PlayerPhysicsState } from '../../shared/level/collision';
import { PLASMA_RIFLE_CONFIG } from '../content/weaponConfig';
import type { ProjectileManager } from '../combat/ProjectileManager';
import { WeaponAmmo, type AmmoState } from '../combat/WeaponAmmo';
import { readMuzzleFirePose } from '../combat/aiming';
import { createWeapon } from '../content/weapon';
import type { KeyboardInput } from '../input/KeyboardInput';
import { POINTER_ADS, POINTER_SHOOT, type PointerInput } from '../input/PointerInput';
import type { PlayerSnapshot } from '../network/types';
import { SPRINT_MULTIPLIER, SprintStamina, type SprintState } from './SprintStamina';
import { HeadBob } from './HeadBob';
import {
  createRemoteHead,
  createRemoteTorso,
  REMOTE_AIM_HEIGHT,
} from './RemoteAvatar';
import { RemoteHealthBar } from './RemoteHealthBar';
import { applyPlayerAim } from './playerAim';
import { WeaponPose, WEAPON_HIP_OFFSET } from './WeaponPose';

const MOVE_SPEED = 5;
const REMOTE_INTERPOLATION_SPEED = 12;
const LOCAL_WEAPON_ROTATION = new THREE.Euler(0, -Math.PI / 2, 0);
/** Third-person: weapon mesh +X must map to lookRig forward (-Z). */
const REMOTE_WEAPON_ROTATION = new THREE.Euler(0, Math.PI / 2, 0);

function lerpAngle(from: number, to: number, t: number): number {
  const delta = THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
  return from + delta * t;
}

export type ShootCallback = (origin: THREE.Vector3, direction: THREE.Vector3) => void;

export class Player {
  readonly object = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera | null;

  private weapon = createWeapon();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private targetPosition = new THREE.Vector3();
  private targetYaw = 0;
  private targetPitch = 0;
  private currentYaw = 0;
  private currentPitch = 0;
  private physics: PlayerPhysicsState = { verticalVelocity: 0, grounded: true };
  private sprint = new SprintStamina();
  private headBob = new HeadBob();
  private headRig: THREE.Group | null = null;
  private bodyRoot: THREE.Group | null = null;
  private lookRig: THREE.Group | null = null;
  private remoteHealthBar: RemoteHealthBar | null = null;
  private muzzleOrigin = new THREE.Vector3();
  private aimDirection = new THREE.Vector3();
  private weaponPose: WeaponPose | null = null;
  private ammo: WeaponAmmo | null = null;
  private onShoot: ShootCallback | null = null;
  private fireCooldown = 0;
  private readonly fireInterval = 1 / PLASMA_RIFLE_CONFIG.fireRate;
  private projectileSpawnOptions: {
    canHitPlayers: boolean;
    ownerTeamId: number;
  } = { canHitPlayers: false, ownerTeamId: -1 };
  private teamId = 0;
  private alive = true;
  private username = 'Player';
  private hp = 100;

  private constructor(local: boolean, bodyColor = 0x6a9fd4) {
    if (local) {
      this.headRig = new THREE.Group();
      this.camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000,
      );
      this.camera.position.set(0, EYE_HEIGHT, 0);
      this.headRig.add(this.camera);
      this.object.add(this.headRig);
      this.weaponPose = new WeaponPose();
      this.ammo = new WeaponAmmo(PLASMA_RIFLE_CONFIG);
      this.attachWeapon(this.camera, LOCAL_WEAPON_ROTATION);
    } else {
      this.camera = null;
      this.bodyRoot = new THREE.Group();
      this.lookRig = new THREE.Group();
      this.lookRig.position.y = REMOTE_AIM_HEIGHT;

      this.bodyRoot.add(createRemoteTorso(bodyColor));
      this.object.add(this.bodyRoot);
      this.object.add(this.lookRig);
      this.lookRig.add(createRemoteHead(bodyColor));
      this.attachWeapon(this.lookRig, REMOTE_WEAPON_ROTATION);

      this.remoteHealthBar = new RemoteHealthBar();
      this.lookRig.add(this.remoteHealthBar.object);
    }
  }

  static createLocal(): Player {
    const player = new Player(true);
    player.setProjectileSpawnOptions(0);
    return player;
  }

  static createRemote(color = 0x6a9fd4): Player {
    return new Player(false, color);
  }

  attachToScene(scene: THREE.Scene): void {
    scene.add(this.object);
  }

  getSprintState(): SprintState {
    return this.sprint.getState();
  }

  getAmmoState(): AmmoState | null {
    return this.ammo?.getState() ?? null;
  }

  addReserveClip(): void {
    this.ammo?.addReserveClip();
  }

  setShootCallback(callback: ShootCallback | null): void {
    this.onShoot = callback;
  }

  setProjectileSpawnOptions(ownerTeamId: number): void {
    this.projectileSpawnOptions = {
      canHitPlayers: true,
      ownerTeamId,
    };
  }

  getTeamId(): number {
    return this.teamId;
  }

  isAlive(): boolean {
    return this.alive;
  }

  getUsername(): string {
    return this.username;
  }

  getHp(): number {
    return this.hp;
  }

  getFeetPosition(): THREE.Vector3 {
    return this.object.position;
  }

  setEyePosition(x: number, y: number, z: number): void {
    this.object.position.set(x, y - EYE_HEIGHT, z);
    this.object.rotation.set(0, 0, 0);
    this.physics = { verticalVelocity: 0, grounded: true };
    this.resetLocalView();
  }

  private resetLocalView(): void {
    if (!this.camera) return;

    this.headBob.reset();
    if (this.headRig) {
      this.headRig.position.set(0, 0, 0);
      this.headRig.rotation.set(0, 0, 0);
      this.headBob.apply(this.headRig, false);
    }

    applyPlayerAim(this.camera, 0, 0);
    this.weaponPose?.reset();
    this.weaponPose?.apply(this.weapon);
    this.weaponPose?.applyCamera(this.camera);
    this.fireCooldown = 0;
  }

  setFromSnapshot(snapshot: PlayerSnapshot, snap = false): void {
    this.targetPosition.set(snapshot.x, snapshot.y - EYE_HEIGHT, snapshot.z);
    this.targetYaw = snapshot.yaw;
    this.targetPitch = snapshot.pitch;
    this.teamId = snapshot.teamId;
    this.alive = snapshot.alive;
    this.username = snapshot.username;
    this.hp = snapshot.hp;

    if (!this.camera) {
      this.object.visible = snapshot.alive;
      this.remoteHealthBar?.update(snapshot.hp, snapshot.alive, snapshot.teamId, snapshot.username);
    }

    if (snap) {
      this.object.position.copy(this.targetPosition);
      this.currentYaw = snapshot.yaw;
      this.currentPitch = snapshot.pitch;
      this.applyRemoteAim();
    }
  }

  interpolateRemote(delta: number): void {
    if (this.camera) return;

    const t = 1 - Math.exp(-REMOTE_INTERPOLATION_SPEED * delta);
    this.object.position.lerp(this.targetPosition, t);
    this.currentYaw = lerpAngle(this.currentYaw, this.targetYaw, t);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.targetPitch, t);
    this.applyRemoteAim();
  }

  updateRemoteHealthBar(camera: THREE.Camera): void {
    this.remoteHealthBar?.updateLayout(camera);
  }

  update(
    delta: number,
    input: KeyboardInput,
    pointer: PointerInput,
    canAct: boolean,
    projectiles: ProjectileManager | null = null,
  ): void {
    if (!this.camera) return;

    if (!canAct) {
      this.headBob.update(delta, false, false);
      if (this.headRig) this.headBob.apply(this.headRig, false);
      return;
    }

    this.weaponPose?.update(delta, pointer.isPressed(POINTER_ADS));
    this.weaponPose?.apply(this.weapon);
    this.weaponPose?.applyCamera(this.camera);

    this.ammo?.update(delta);

    if (input.isJustPressed('KeyR')) {
      this.ammo?.tryReload();
    }

    this.updateFire(delta, pointer, projectiles);

    const speed = MOVE_SPEED * delta;

    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();

    this.right.crossVectors(this.forward, this.camera.up).normalize();

    const wantsSprint =
      input.isPressed('ShiftLeft') &&
      input.isPressed('KeyW') &&
      this.physics.grounded;

    const isSprinting = this.sprint.update(delta, wantsSprint);
    const forwardSpeed = speed * (isSprinting ? SPRINT_MULTIPLIER : 1);

    let deltaX = 0;
    let deltaZ = 0;

    if (input.isPressed('KeyW')) {
      deltaX += this.forward.x * forwardSpeed;
      deltaZ += this.forward.z * forwardSpeed;
    }
    if (input.isPressed('KeyS')) {
      deltaX -= this.forward.x * speed;
      deltaZ -= this.forward.z * speed;
    }
    if (input.isPressed('KeyD')) {
      deltaX += this.right.x * speed;
      deltaZ += this.right.z * speed;
    }
    if (input.isPressed('KeyA')) {
      deltaX -= this.right.x * speed;
      deltaZ -= this.right.z * speed;
    }

    const jump = input.isJustPressed('Space');
    const result = stepPlayerPhysics(
      this.object.position.x,
      this.object.position.y,
      this.object.position.z,
      this.physics,
      deltaX,
      deltaZ,
      jump,
      delta,
    );

    this.object.position.set(result.x, result.y, result.z);
    this.physics = result.state;

    const isMoving =
      this.physics.grounded &&
      (input.isPressed('KeyW') ||
        input.isPressed('KeyS') ||
        input.isPressed('KeyA') ||
        input.isPressed('KeyD'));

    this.headBob.update(delta, isMoving, isSprinting);
    if (this.headRig) this.headBob.apply(this.headRig, isSprinting);
  }

  resize(): void {
    if (!this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.remoteHealthBar?.dispose();
    this.remoteHealthBar = null;
    this.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.object.removeFromParent();
  }

  private updateFire(
    delta: number,
    pointer: PointerInput,
    projectiles: ProjectileManager | null,
  ): void {
    if (!pointer.isPressed(POINTER_SHOOT)) {
      this.fireCooldown = 0;
      return;
    }

    this.fireCooldown -= delta;
    if (this.fireCooldown > 0) return;

    if (!this.shoot(projectiles)) return;

    this.fireCooldown += this.fireInterval;
  }

  private shoot(projectiles: ProjectileManager | null): boolean {
    if (!this.camera || !projectiles || !this.ammo?.tryShoot()) return false;

    this.object.updateMatrixWorld(true);

    readMuzzleFirePose(
      this.weapon,
      this.camera,
      this.muzzleOrigin,
      this.aimDirection,
    );
    projectiles.spawn(this.muzzleOrigin, this.aimDirection, this.projectileSpawnOptions);
    this.onShoot?.(this.muzzleOrigin, this.aimDirection);
    return true;
  }

  private applyRemoteAim(): void {
    if (!this.bodyRoot || !this.lookRig) return;

    this.bodyRoot.rotation.set(0, this.currentYaw, 0);
    applyPlayerAim(this.lookRig, this.currentYaw, this.currentPitch);
  }

  private attachWeapon(parent: THREE.Object3D, rotation: THREE.Euler): void {
    parent.add(this.weapon);
    this.weapon.position.copy(this.weaponPose?.hipOffset ?? WEAPON_HIP_OFFSET);
    this.weapon.rotation.copy(rotation);
  }
}
