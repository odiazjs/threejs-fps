import * as THREE from 'three';
import type { WeaponConfig } from '../../shared/content/weaponConfig';
import type { WeaponId } from '../../shared/content/weaponIds';
import { LOADOUT_SIZE } from '../../shared/content/weaponIds';
import { WeaponAmmo, type AmmoState } from './WeaponAmmo';
import { WeaponRecoil } from './WeaponRecoil';
import { createWeaponMesh } from '../content/weaponMeshes';

const SWITCH_READY_SEC = 0.2;

export type WeaponMeshContext = 'local' | 'remote';

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

  constructor(configs: readonly WeaponConfig[]) {
    if (configs.length !== LOADOUT_SIZE) {
      throw new Error(`Loadout requires exactly ${LOADOUT_SIZE} weapons`);
    }
    this.slots = configs.map((config) => new WeaponSlot(config));
    this.slots[0]!.mesh.visible = true;
  }

  attach(parent: THREE.Object3D, rotation: THREE.Euler, context: WeaponMeshContext): void {
    for (const slot of this.slots) {
      parent.add(slot.mesh);
      const { hip } = slot.config.view;
      slot.mesh.position.set(hip.x, hip.y, hip.z);
      applyWeaponMeshRotation(slot.mesh, rotation, slot.config.view, context);
    }
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
    if (this.getActive().ammo.getState().reloading) return false;

    this.slots[this.activeIndex]!.mesh.visible = false;
    this.activeIndex = slotIndex;
    this.slots[this.activeIndex]!.mesh.visible = true;
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

  setRemoteActiveWeapon(weaponId: WeaponId): void {
    const index = this.slots.findIndex((slot) => slot.config.id === weaponId);
    if (index < 0) return;

    for (const slot of this.slots) {
      slot.mesh.visible = false;
    }
    this.activeIndex = index;
    this.slots[index]!.mesh.visible = true;
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
