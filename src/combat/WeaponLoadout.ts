import * as THREE from 'three';
import type { WeaponConfig } from '../../shared/content/weaponConfig';
import type { WeaponId } from '../../shared/content/weaponIds';
import { LOADOUT_SIZE } from '../../shared/content/weaponIds';
import { WeaponAmmo, type AmmoState } from './WeaponAmmo';
import { WeaponRecoil } from './WeaponRecoil';
import { createWeaponMesh } from '../content/weaponMeshes';

const SWITCH_READY_SEC = 0.2;
/** Default scale baked into procedural weapon meshes (first-person viewmodel size). */
export const WEAPON_MESH_BASE_SCALE = 0.1;

export type WeaponMeshContext = 'local' | 'remote';

/** Extra multiplier so third-person weapons read clearly on the character mesh. */
const REMOTE_WEAPON_SCALE_FACTOR = 1.6;

export function remoteWeaponMeshScale(characterFitScale: number): number {
  return (WEAPON_MESH_BASE_SCALE / characterFitScale) * REMOTE_WEAPON_SCALE_FACTOR;
}

function applyMeshContextScale(mesh: THREE.Object3D, context: WeaponMeshContext, characterFitScale?: number): void {
  const scale =
    context === 'remote' && characterFitScale
      ? remoteWeaponMeshScale(characterFitScale)
      : WEAPON_MESH_BASE_SCALE;
  mesh.scale.setScalar(scale);
  mesh.frustumCulled = false;
}

function getAttachOffset(
  view: WeaponConfig['view'],
  context: WeaponMeshContext,
): { x: number; y: number; z: number } {
  if (context === 'remote' && view.remoteHand) {
    return view.remoteHand;
  }
  return view.hip;
}

export function applyWeaponMeshRotation(
  mesh: THREE.Object3D,
  baseRotation: THREE.Euler,
  view: WeaponConfig['view'],
  context: WeaponMeshContext,
): void {
  resolveWeaponMeshRotation(baseRotation, view, context, mesh.rotation);
}

export function resolveWeaponMeshRotation(
  baseRotation: THREE.Euler,
  view: WeaponConfig['view'],
  context: WeaponMeshContext,
  target: THREE.Euler,
): THREE.Euler {
  const extra = context === 'local' ? view.localMeshEuler : view.remoteMeshEuler;
  if (!extra) {
    return target.copy(baseRotation);
  }

  return target.set(
    baseRotation.x + extra.x,
    baseRotation.y + extra.y,
    baseRotation.z + extra.z,
    baseRotation.order,
  );
}

export interface LoadoutAmmoState extends AmmoState {
  weaponName: string;
  slotIndex: number;
}

export class WeaponSlot {
  readonly config: WeaponConfig;
  readonly ammo: WeaponAmmo;
  readonly recoil: WeaponRecoil;
  readonly mesh: THREE.Group;

  constructor(config: WeaponConfig) {
    this.config = config;
    this.ammo = new WeaponAmmo(config);
    this.recoil = new WeaponRecoil(config.recoil);
    this.mesh = createWeaponMesh(config.id);
    this.mesh.visible = false;
  }

  get fireInterval(): number {
    return 1 / this.config.fireRate;
  }

  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.mesh.removeFromParent();
  }
}

export class WeaponLoadout {
  private readonly slots: WeaponSlot[];
  private activeIndex = 0;
  private switchCooldown = 0;
  private meshesForcedHidden = false;

  constructor(configs: readonly WeaponConfig[]) {
    if (configs.length !== LOADOUT_SIZE) {
      throw new Error(`Loadout requires exactly ${LOADOUT_SIZE} weapons`);
    }
    this.slots = configs.map((config) => new WeaponSlot(config));
    this.slots[0]!.mesh.visible = true;
  }

  attach(
    parent: THREE.Object3D,
    rotation: THREE.Euler,
    context: WeaponMeshContext,
    characterFitScale?: number,
  ): void {
    for (const slot of this.slots) {
      parent.add(slot.mesh);
      applyMeshContextScale(slot.mesh, context, characterFitScale);
      const offset = getAttachOffset(slot.config.view, context);
      slot.mesh.position.set(offset.x, offset.y, offset.z);
      applyWeaponMeshRotation(slot.mesh, rotation, slot.config.view, context);
    }
    this.syncMeshVisibility();
  }

  reattach(
    parent: THREE.Object3D,
    rotation: THREE.Euler,
    context: WeaponMeshContext,
    characterFitScale?: number,
    basePosition?: THREE.Vector3,
  ): void {
    for (const slot of this.slots) {
      slot.mesh.removeFromParent();
      parent.add(slot.mesh);
      applyMeshContextScale(slot.mesh, context, characterFitScale);
      const offset = basePosition ?? getAttachOffset(slot.config.view, context);
      slot.mesh.position.copy(offset);
      applyWeaponMeshRotation(slot.mesh, rotation, slot.config.view, context);
    }
    this.syncMeshVisibility();
  }

  getActiveIndex(): number {
    return this.activeIndex;
  }

  getActive(): WeaponSlot {
    return this.slots[this.activeIndex]!;
  }

  getActiveWeaponId(): WeaponId {
    return this.getActive().config.id;
  }

  getActiveDamage(): number {
    return this.getActive().config.damage;
  }

  getSlot(index: number): WeaponSlot | null {
    return this.slots[index] ?? null;
  }

  getAmmoState(): LoadoutAmmoState {
    const active = this.getActive();
    return {
      ...active.ammo.getState(),
      weaponName: active.config.name,
      slotIndex: this.activeIndex,
    };
  }

  isWeaponReady(): boolean {
    return this.switchCooldown <= 0;
  }

  getSwitchReadySec(): number {
    return SWITCH_READY_SEC;
  }

  update(delta: number): void {
    if (this.switchCooldown > 0) {
      this.switchCooldown = Math.max(0, this.switchCooldown - delta);
    }

    for (const slot of this.slots) {
      slot.ammo.update(delta);
    }
  }

  trySwitch(slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= this.slots.length) return false;
    if (slotIndex === this.activeIndex) return false;
    if (this.switchCooldown > 0) return false;

    this.getActive().ammo.cancelReload();

    this.slots[this.activeIndex]!.mesh.visible = false;
    this.activeIndex = slotIndex;
    this.syncMeshVisibility();
    this.slots[this.activeIndex]!.recoil.reset();
    this.switchCooldown = SWITCH_READY_SEC;
    return true;
  }

  applyActiveRotation(baseRotation: THREE.Euler, context: WeaponMeshContext): void {
    const active = this.getActive();
    applyWeaponMeshRotation(active.mesh, baseRotation, active.config.view, context);
  }

  addReserveToActive(): void {
    this.getActive().ammo.addReserveClip();
  }

  refillAllAmmo(reserveRounds?: number): void {
    for (const slot of this.slots) {
      slot.ammo.refill(reserveRounds);
    }
  }

  setRemoteActiveWeapon(weaponId: WeaponId): void {
    const index = this.slots.findIndex((slot) => slot.config.id === weaponId);
    if (index < 0) return;

    for (const slot of this.slots) {
      slot.mesh.visible = false;
    }
    this.activeIndex = index;
    this.syncMeshVisibility();
  }

  setMeshesVisible(visible: boolean): void {
    this.meshesForcedHidden = !visible;
    this.syncMeshVisibility();
  }

  private syncMeshVisibility(): void {
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i]!.mesh.visible = !this.meshesForcedHidden && i === this.activeIndex;
    }
  }

  reset(): void {
    for (const slot of this.slots) {
      slot.recoil.reset();
    }
    this.switchCooldown = 0;
  }

  dispose(): void {
    for (const slot of this.slots) {
      slot.dispose();
    }
  }
}
