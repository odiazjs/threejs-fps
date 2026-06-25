import * as THREE from 'three';
import { EYE_HEIGHT, stepPlayerPhysics, type PlayerPhysicsState } from '../../shared/level/collision';
import { DEFAULT_LOADOUT_CONFIGS } from '../content/weaponConfig';
import type { ProjectileManager } from '../combat/ProjectileManager';
import { WeaponLoadout, type LoadoutAmmoState, resolveWeaponMeshRotation } from '../combat/WeaponLoadout';
import { readMuzzleFirePose } from '../combat/aiming';
import type { KeyboardInput } from '../input/KeyboardInput';
import { POINTER_ADS, POINTER_SHOOT, type PointerInput } from '../input/PointerInput';
import type { PlayerSnapshot } from '../network/types';
import { SPRINT_MULTIPLIER, SprintStamina, type SprintState } from './SprintStamina';
import { HeadBob } from './HeadBob';
import {
  createCharacterInstance,
  gameModelFileForWeapon,
  loadGameCharacterTemplate,
  preloadGameCharacterModels,
  resolveCharacterRig,
  type CharacterInstance,
  type CharacterTemplate,
  type RemoteCharacterPose,
} from './characterModel';
import { getRemoteWeaponMount, type RemoteWeaponMount } from './remoteWeaponMount';
import { RemoteHealthBar } from './RemoteHealthBar';
import { DamageNumberStack } from '../ui/DamageNumberStack';
import { applyPlayerAim, readWorldPlayerAim } from './playerAim';
import { WeaponPose } from './WeaponPose';
import { getReloadState } from '../../shared/combat/reload';
import {
  isWeaponId,
  loadoutSlotFromKey,
  LOADOUT_WEAPON_IDS,
  type WeaponId,
} from '../../shared/content/weaponIds';

const MOVE_SPEED = 3;
const REMOTE_INTERPOLATION_SPEED = 12;
const LOCAL_WEAPON_ROTATION = new THREE.Euler(0, -Math.PI / 2, 0);

const _spinePitchAxis = new THREE.Vector3(1, 0, 0);
const _spinePitchQuat = new THREE.Quaternion();

function lerpAngle(from: number, to: number, t: number): number {
  const delta = THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
  return from + delta * t;
}

export type ShootCallback = (origin: THREE.Vector3, direction: THREE.Vector3) => void;
export type WeaponSwitchCallback = (slot: number, weaponId: WeaponId) => void;
export type ReloadNetworkCallback = (weaponId: WeaponId) => void;

export class Player {
  readonly object = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera | null;
  /** Pointer-lock target — mouse look applies here. */
  readonly aimRig: THREE.Group | null;

  private loadout: WeaponLoadout | null = null;
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
  private yawRecoilRig: THREE.Group | null = null;
  private pitchRecoilRig: THREE.Group | null = null;
  private bodyRoot: THREE.Group | null = null;
  private pitchPivot: THREE.Group | null = null;
  private lookRig: THREE.Group | null = null;
  private handRig: THREE.Group | null = null;
  private spineBone: THREE.Object3D | null = null;
  private lookRigFollowsHead = false;
  private characterInstance: CharacterInstance | null = null;
  private displayedCharacterModelFile: string | null = null;
  private remoteWeaponMount: RemoteWeaponMount | null = null;
  private remoteHealthBar: RemoteHealthBar | null = null;
  private damageNumberStack: DamageNumberStack | null = null;
  private muzzleOrigin = new THREE.Vector3();
  private aimDirection = new THREE.Vector3();
  private weaponPose: WeaponPose | null = null;
  private onShoot: ShootCallback | null = null;
  private onReloadNetwork: ReloadNetworkCallback | null = null;
  private onWeaponSwitchNetwork: WeaponSwitchCallback | null = null;
  private targetReloadEndAt = 0;
  private targetActiveWeaponId: WeaponId = LOADOUT_WEAPON_IDS[0];
  private targetSprinting = false;
  private targetWalking = false;
  private locomotionWalking = false;
  private remoteDisplayedWeaponId: WeaponId = LOADOUT_WEAPON_IDS[0];
  private readonly remoteWeaponBasePosition = new THREE.Vector3();
  private readonly remoteWeaponBaseRotation = new THREE.Euler();
  private readonly activeMeshBaseRotation = new THREE.Euler();
  private fireCooldown = 0;
  private projectileSpawnOptions: {
    canHitPlayers: boolean;
    ownerTeamId: number;
  } = { canHitPlayers: false, ownerTeamId: -1 };
  private teamId = 0;
  private alive = true;
  private username = 'Player';
  private hp = 100;

  private constructor(local: boolean) {
    this.loadout = new WeaponLoadout(DEFAULT_LOADOUT_CONFIGS);

    if (local) {
      this.headRig = new THREE.Group();
      this.yawRecoilRig = new THREE.Group();
      this.aimRig = new THREE.Group();
      this.pitchRecoilRig = new THREE.Group();
      this.camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000,
      );
      this.camera.position.set(0, EYE_HEIGHT, 0);
      this.pitchRecoilRig.add(this.camera);
      this.aimRig.add(this.pitchRecoilRig);
      this.yawRecoilRig.add(this.aimRig);
      this.headRig.add(this.yawRecoilRig);
      this.object.add(this.headRig);
      this.weaponPose = new WeaponPose();
      this.weaponPose.setViewConfig(this.loadout.getActive().config.view);
      this.loadout.attach(this.camera, LOCAL_WEAPON_ROTATION, 'local');
    } else {
      this.camera = null;
      this.aimRig = null;
      this.bodyRoot = new THREE.Group();
      this.pitchPivot = new THREE.Group();
      this.lookRig = new THREE.Group();

      this.bodyRoot.add(this.pitchPivot);
      this.object.add(this.bodyRoot);
      this.object.add(this.lookRig);

      this.weaponPose = new WeaponPose();
      this.loadout.attach(this.lookRig, LOCAL_WEAPON_ROTATION, 'remote');

      this.remoteHealthBar = new RemoteHealthBar();
      this.lookRig.add(this.remoteHealthBar.object);

      this.damageNumberStack = new DamageNumberStack();
      this.lookRig.add(this.damageNumberStack.object);
    }
  }

  static createLocal(): Player {
    const player = new Player(true);
    player.setProjectileSpawnOptions(0);
    return player;
  }

  static createRemote(_color = 0x6a9fd4): Player {
    return new Player(false);
  }

  static async preloadGameCharacterModels(): Promise<void> {
    await preloadGameCharacterModels();
  }

  async syncRemoteCharacterModel(): Promise<void> {
    if (this.camera) return;

    const weaponId = this.targetActiveWeaponId;
    const pose = this.getRemotePose();
    const modelFile = gameModelFileForWeapon(weaponId, pose);
    if (this.displayedCharacterModelFile === modelFile && this.characterInstance) return;

    const template = await loadGameCharacterTemplate(weaponId, pose);
    this.setCharacterModel(template);
    this.applyRemoteAim();
    this.characterInstance?.update(0);
    this.applyRemoteSpinePitch();
  }

  private getRemotePose(): RemoteCharacterPose {
    return { sprinting: this.targetSprinting, walking: this.targetWalking };
  }

  setCharacterModel(template: CharacterTemplate): void {
    if (!this.pitchPivot || !this.lookRig || !this.loadout || this.camera) return;
    if (this.displayedCharacterModelFile === template.modelFile && this.characterInstance) return;

    if (this.lookRigFollowsHead && this.lookRig.parent) {
      this.lookRig.parent.remove(this.lookRig);
      this.object.add(this.lookRig);
      this.lookRigFollowsHead = false;
    }

    this.characterInstance?.dispose();
    this.characterInstance = createCharacterInstance(template);
    this.pitchPivot.add(this.characterInstance.root);
    this.displayedCharacterModelFile = template.modelFile;
    this.bindRemoteCharacterRig(template);
  }

  private bindRemoteCharacterRig(template: CharacterTemplate): void {
    if (!this.characterInstance || !this.lookRig || !this.loadout) return;

    const rig = resolveCharacterRig(this.characterInstance.root, template.bones);
    if (!rig) {
      console.warn('[Player] Character hand/head bones not found');
      return;
    }

    this.refreshRemoteWeaponMount(template);

    this.handRig = new THREE.Group();
    this.handRig.name = 'remoteHandRig';
    this.handRig.position.copy(this.remoteWeaponMount!.handPosition);
    this.handRig.rotation.copy(this.remoteWeaponMount!.handRotation);
    rig.rightHand.add(this.handRig);
    this.spineBone = rig.spine;

    const mount = this.remoteWeaponMount!;
    this.loadout.reattach(
      this.handRig,
      mount.weaponRotation,
      'remote',
      template.fitScale,
      mount.weaponPosition,
    );

    this.object.remove(this.lookRig);
    this.lookRig.position.set(0, 0, 0);
    this.lookRig.rotation.set(0, 0, 0);
    rig.head.add(this.lookRig);
    this.lookRigFollowsHead = true;
  }

  private refreshRemoteWeaponMount(template: CharacterTemplate): void {
    if (!this.loadout) return;

    this.remoteWeaponMount = getRemoteWeaponMount(
      template.modelFile,
      this.loadout.getActiveWeaponId(),
    );
    this.remoteWeaponBasePosition.copy(this.remoteWeaponMount.weaponPosition);
    this.remoteWeaponBaseRotation.copy(this.remoteWeaponMount.weaponRotation);
  }

  attachToScene(scene: THREE.Scene): void {
    scene.add(this.object);
  }

  getSprintState(): SprintState {
    return this.sprint.getState();
  }

  getLocomotionState(): { isSprinting: boolean; isWalking: boolean } {
    if (this.camera) {
      return {
        isSprinting: this.sprint.getState().isSprinting,
        isWalking: this.locomotionWalking,
      };
    }

    return {
      isSprinting: this.targetSprinting,
      isWalking: this.targetWalking,
    };
  }

  getAmmoState(): LoadoutAmmoState | null {
    return this.loadout?.getAmmoState() ?? null;
  }

  getActiveWeaponId(): WeaponId {
    return this.loadout?.getActiveWeaponId() ?? LOADOUT_WEAPON_IDS[0];
  }

  getActiveDamage(): number {
    return this.loadout?.getActiveDamage() ?? 5;
  }

  addReserveClip(): void {
    this.loadout?.addReserveToActive();
  }

  setShootCallback(callback: ShootCallback | null): void {
    this.onShoot = callback;
  }

  setReloadNetworkCallback(callback: ReloadNetworkCallback | null): void {
    this.onReloadNetwork = callback;
  }

  setWeaponSwitchNetworkCallback(callback: WeaponSwitchCallback | null): void {
    this.onWeaponSwitchNetwork = callback;
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

  getNetworkAim(): { yaw: number; pitch: number } {
    if (!this.camera) return { yaw: 0, pitch: 0 };
    this.object.updateMatrixWorld(true);
    return readWorldPlayerAim(this.camera);
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

    applyPlayerAim(this.aimRig!, 0, 0);
    this.loadout?.reset();
    this.weaponPose?.reset();
    if (this.loadout) {
      this.weaponPose?.setViewConfig(this.loadout.getActive().config.view);
    }
    if (this.yawRecoilRig && this.pitchRecoilRig) {
      this.applyActiveRecoilAim();
    }
    this.applyActiveWeaponPose();
    this.weaponPose?.applyCamera(this.camera);
    this.fireCooldown = 0;
  }

  setFromSnapshot(snapshot: PlayerSnapshot, snap = false): void {
    this.targetPosition.set(snapshot.x, snapshot.y - EYE_HEIGHT, snapshot.z);
    this.targetYaw = snapshot.yaw;
    this.targetPitch = snapshot.pitch;
    this.targetReloadEndAt = snapshot.reloadEndAt;
    if (isWeaponId(snapshot.activeWeaponId)) {
      this.targetActiveWeaponId = snapshot.activeWeaponId;
      this.loadout?.setRemoteActiveWeapon(snapshot.activeWeaponId);
    }
    this.targetSprinting = snapshot.sprinting;
    this.targetWalking = snapshot.walking;
    this.teamId = snapshot.teamId;
    this.alive = snapshot.alive;
    this.username = snapshot.username;
    this.hp = snapshot.hp;

    if (!this.camera) {
      this.object.visible = snapshot.alive;
      this.remoteHealthBar?.update(snapshot.hp, snapshot.alive, snapshot.teamId, snapshot.username);
      if (!snapshot.alive) {
        this.damageNumberStack?.clear();
      }
    }

    if (snap) {
      this.object.position.copy(this.targetPosition);
      this.currentYaw = snapshot.yaw;
      this.currentPitch = snapshot.pitch;
      this.applyRemoteAim();
      this.characterInstance?.update(0);
      this.applyRemoteSpinePitch();
    }
  }

  interpolateRemote(delta: number): void {
    if (this.camera) return;

    const t = 1 - Math.exp(-REMOTE_INTERPOLATION_SPEED * delta);
    this.object.position.lerp(this.targetPosition, t);
    this.currentYaw = lerpAngle(this.currentYaw, this.targetYaw, t);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.targetPitch, t);
    this.applyRemoteAim();
    this.characterInstance?.update(delta);
    this.applyRemoteSpinePitch();
  }

  updateRemoteHealthBar(camera: THREE.Camera): void {
    this.remoteHealthBar?.updateLayout(camera);
  }

  showDamageNumber(amount: number): void {
    this.damageNumberStack?.push(amount);
  }

  updateDamageNumbers(delta: number, camera: THREE.Camera): void {
    this.damageNumberStack?.update(delta, camera);
  }

  updateRemoteWeapon(delta: number, worldTime: number): void {
    if (this.camera || !this.weaponPose || !this.loadout) return;

    const weaponChanged = this.targetActiveWeaponId !== this.remoteDisplayedWeaponId;
    if (weaponChanged) {
      this.loadout.setRemoteActiveWeapon(this.targetActiveWeaponId);
      this.remoteDisplayedWeaponId = this.targetActiveWeaponId;
      this.weaponPose.setViewConfig(this.loadout.getActive().config.view);
      this.weaponPose.startSwitch(this.loadout.getSwitchReadySec());
    }

    if (!this.remoteWeaponMount) return;

    const active = this.loadout.getActive();
    this.remoteWeaponBasePosition.copy(this.remoteWeaponMount.weaponPosition);
    resolveWeaponMeshRotation(
      this.remoteWeaponMount.weaponRotation,
      active.config.view,
      'remote',
      this.remoteWeaponBaseRotation,
    );
    this.loadout.applyActiveRotation(this.remoteWeaponMount.weaponRotation, 'remote');
    const { reloading, progress } = getReloadState(
      this.targetReloadEndAt,
      worldTime,
      this.targetActiveWeaponId,
    );

    this.weaponPose.update(delta, false, reloading, progress);
    this.weaponPose.applyRemoteReload(
      active.mesh,
      this.remoteWeaponBasePosition,
      this.remoteWeaponBaseRotation,
    );
  }

  update(
    delta: number,
    input: KeyboardInput,
    pointer: PointerInput,
    canAct: boolean,
    projectiles: ProjectileManager | null = null,
  ): void {
    if (!this.camera || !this.loadout) return;

    if (!canAct) {
      this.headBob.update(delta, false, false);
      if (this.headRig) this.headBob.apply(this.headRig, false);
      return;
    }

    this.trySwitchWeapon(input);

    if (input.isJustPressed('KeyR')) {
      if (
        this.loadout.isWeaponReady() &&
        !this.weaponPose?.isSwitching() &&
        this.loadout.getActive().ammo.tryReload()
      ) {
        this.onReloadNetwork?.(this.loadout.getActiveWeaponId());
      }
    }

    const ads = pointer.isPressed(POINTER_ADS);
    const active = this.loadout.getActive();
    const ammoState = active.ammo.getState();
    const shooting = this.isFiring(pointer, active.config.fireMode);

    this.loadout.update(delta);

    this.weaponPose?.setViewConfig(active.config.view);
    this.weaponPose?.update(
      delta,
      ads,
      ammoState.reloading,
      ammoState.reloadProgress,
    );
    active.recoil.update(delta, shooting, ads);
    if (this.yawRecoilRig && this.pitchRecoilRig) {
      this.applyActiveRecoilAim();
    }
    this.applyActiveWeaponPose();
    this.weaponPose?.applyCamera(this.camera);
    const baseRotation = this.getActiveMeshBaseRotation();
    const weaponRotation = this.weaponPose?.getWeaponRotation(baseRotation) ?? baseRotation;
    active.recoil.applyWeaponVisual(
      active.mesh,
      weaponRotation,
      this.weaponPose?.adsBlend ?? 0,
    );

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
    this.locomotionWalking = isMoving && !isSprinting;
  }

  resize(): void {
    if (!this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.remoteHealthBar?.dispose();
    this.remoteHealthBar = null;
    this.damageNumberStack?.dispose();
    this.damageNumberStack = null;
    this.characterInstance?.dispose();
    this.characterInstance = null;
    this.displayedCharacterModelFile = null;
    this.remoteWeaponMount = null;
    this.handRig = null;
    this.spineBone = null;
    this.lookRigFollowsHead = false;
    this.loadout?.dispose();
    this.loadout = null;
    this.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.object.removeFromParent();
  }

  private trySwitchWeapon(input: KeyboardInput): void {
    if (!this.loadout) return;

    for (const code of ['Digit1', 'Digit2'] as const) {
      if (!input.isJustPressed(code)) continue;
      const slot = loadoutSlotFromKey(code);
      if (slot === null) continue;
      if (!this.loadout.trySwitch(slot)) continue;

      this.weaponPose?.setViewConfig(this.loadout.getActive().config.view);
      this.weaponPose?.startSwitch(this.loadout.getSwitchReadySec());
      this.loadout.applyActiveRotation(LOCAL_WEAPON_ROTATION, 'local');
      this.onWeaponSwitchNetwork?.(slot, this.loadout.getActiveWeaponId());
      break;
    }
  }

  private isFiring(pointer: PointerInput, fireMode: 'auto' | 'semi'): boolean {
    return fireMode === 'semi'
      ? pointer.isJustPressed(POINTER_SHOOT)
      : pointer.isPressed(POINTER_SHOOT);
  }

  private updateFire(
    delta: number,
    pointer: PointerInput,
    projectiles: ProjectileManager | null,
  ): void {
    if (!this.loadout) return;

    this.fireCooldown = Math.max(0, this.fireCooldown - delta);

    const active = this.loadout.getActive();
    const wantsFire = this.isFiring(pointer, active.config.fireMode);
    if (!wantsFire) return;

    if (!this.loadout.isWeaponReady() || this.weaponPose?.isSwitching()) return;
    if (this.fireCooldown > 0) return;

    if (!this.shoot(projectiles)) return;

    this.fireCooldown += active.fireInterval;
  }

  private shoot(projectiles: ProjectileManager | null): boolean {
    if (!this.camera || !this.loadout || !projectiles) return false;

    const active = this.loadout.getActive();
    if (!active.ammo.tryShoot()) return false;

    active.recoil.onShot(this.weaponPose?.adsBlend ?? 0);
    this.object.updateMatrixWorld(true);

    readMuzzleFirePose(
      active.mesh,
      this.camera,
      this.muzzleOrigin,
      this.aimDirection,
    );
    projectiles.spawn(this.muzzleOrigin, this.aimDirection, this.projectileSpawnOptions);
    this.onShoot?.(this.muzzleOrigin, this.aimDirection);
    return true;
  }

  private getActiveRecoil() {
    return this.loadout?.getActive().recoil ?? null;
  }

  private applyActiveRecoilAim(): void {
    const recoil = this.getActiveRecoil();
    if (!recoil || !this.yawRecoilRig || !this.pitchRecoilRig) return;
    recoil.applyAim(this.yawRecoilRig, this.pitchRecoilRig);
  }

  private applyActiveWeaponPose(): void {
    if (!this.loadout) return;
    this.weaponPose?.apply(this.loadout.getActive().mesh);
  }

  private getActiveMeshBaseRotation(): THREE.Euler {
    const active = this.loadout!.getActive();
    return resolveWeaponMeshRotation(
      LOCAL_WEAPON_ROTATION,
      active.config.view,
      'local',
      this.activeMeshBaseRotation,
    );
  }

  private applyRemoteAim(): void {
    if (!this.bodyRoot || !this.pitchPivot || !this.lookRig) return;

    this.bodyRoot.rotation.set(0, this.currentYaw, 0);
    this.pitchPivot.rotation.set(0, 0, 0);

    if (!this.lookRigFollowsHead) {
      applyPlayerAim(this.lookRig, this.currentYaw, this.currentPitch);
    }
  }

  /** Pitch on the spine (waist up) so legs stay grounded in the idle pose. */
  private applyRemoteSpinePitch(): void {
    if (!this.spineBone) return;

    _spinePitchQuat.setFromAxisAngle(_spinePitchAxis, -this.currentPitch);
    this.spineBone.quaternion.multiply(_spinePitchQuat);
  }
}
