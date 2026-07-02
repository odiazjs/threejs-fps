import * as THREE from 'three';
import type { WeaponConfig } from '../../shared/content/weaponConfig';
import type { WeaponId } from '../../shared/content/weaponIds';
import { isWeaponId, LOADOUT_SIZE, MELEE_WEAPON_ID } from '../../shared/content/weaponIds';
import type { LoadoutSlotSnapshot } from '../../shared/loadout/loadoutSlots';
import { WeaponAmmo, type AmmoState } from './WeaponAmmo';
import { WeaponRecoil } from './WeaponRecoil';
import { createWeaponMesh } from '../content/weaponMeshes';

const SWITCH_READY_SEC = 0.2;
/** Default scale baked into procedural weapon meshes (first-person viewmodel size). */
export const WEAPON_MESH_BASE_SCALE = 0.1;

export type WeaponMeshContext = 'local' | 'remote';

/** Extra multiplier so third-person weapons read clearly on the character mesh. */
const REMOTE_WEAPON_SCALE_FACTOR = 1.6;
/** Katana reads small on the Mixamo hand — boost third-person size only. */
const REMOTE_KATANA_SCALE_MULTIPLIER = 1.5;

export function remoteWeaponMeshScale(
  characterFitScale: number,
  weaponId?: WeaponId,
): number {
  const katanaBoost = weaponId === MELEE_WEAPON_ID ? REMOTE_KATANA_SCALE_MULTIPLIER : 1;
  return (WEAPON_MESH_BASE_SCALE / characterFitScale) * REMOTE_WEAPON_SCALE_FACTOR * katanaBoost;
}

/** Gun-style attach — barrel points down -Z in view space. */
export const LOCAL_GUN_WEAPON_ROTATION = new THREE.Euler(0, -Math.PI / 2, 0);

/** Katana idle — vertical blade, slight forward lean (chudan-style ready). */
export const LOCAL_KATANA_WEAPON_ROTATION = new THREE.Euler(0.1, 0.22, 0.04);

export const REMOTE_KATANA_WEAPON_ROTATION = new THREE.Euler(-0.1, -0.22, -0.04);

export function getLocalWeaponBaseRotation(config: WeaponConfig): THREE.Euler {
  return config.fireMode === 'melee' ? LOCAL_KATANA_WEAPON_ROTATION : LOCAL_GUN_WEAPON_ROTATION;
}

export function getRemoteWeaponBaseRotation(
  config: WeaponConfig,
  fallback: THREE.Euler,
): THREE.Euler {
  return config.fireMode === 'melee' ? REMOTE_KATANA_WEAPON_ROTATION : fallback;
}

function applyMeshContextScale(
  mesh: THREE.Object3D,
  context: WeaponMeshContext,
  characterFitScale?: number,
  weaponId?: WeaponId,
): void {
  const scale =
    context === 'remote' && characterFitScale
      ? remoteWeaponMeshScale(characterFitScale, weaponId)
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

function parseSlotWeaponId(raw: string): WeaponId | null {
  return isWeaponId(raw) ? raw : null;
}

export interface LoadoutAmmoState extends AmmoState {
  weaponName: string;
  slotIndex: number;
  meleeEquipped?: boolean;
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
  private readonly weaponsById: Map<WeaponId, WeaponSlot>;
  private readonly slotAssignments: (WeaponId | null)[];
  private readonly meleeSlot: WeaponSlot | null;
  private activeIndex = 0;
  private meleeEquipped = false;
  private switchCooldown = 0;
  private meshesForcedHidden = false;

  constructor(configs: readonly WeaponConfig[], meleeConfig?: WeaponConfig) {
    if (configs.length !== LOADOUT_SIZE) {
      throw new Error(`Loadout requires exactly ${LOADOUT_SIZE} weapons`);
    }
    this.weaponsById = new Map(configs.map((config) => [config.id, new WeaponSlot(config)]));
    this.slotAssignments = configs.map((config) => config.id);
    this.meleeSlot =
      meleeConfig && meleeConfig.id === MELEE_WEAPON_ID
        ? new WeaponSlot(meleeConfig)
        : null;
    this.syncMeshVisibility();
  }

  attach(
    parent: THREE.Object3D,
    rotation: THREE.Euler,
    context: WeaponMeshContext,
    characterFitScale?: number,
  ): void {
    for (const slot of this.allWeaponSlots()) {
      parent.add(slot.mesh);
      applyMeshContextScale(slot.mesh, context, characterFitScale, slot.config.id);
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
    for (const slot of this.allWeaponSlots()) {
      slot.mesh.removeFromParent();
      parent.add(slot.mesh);
      applyMeshContextScale(slot.mesh, context, characterFitScale, slot.config.id);
      const offset = basePosition ?? getAttachOffset(slot.config.view, context);
      slot.mesh.position.copy(offset);
      applyWeaponMeshRotation(slot.mesh, rotation, slot.config.view, context);
    }
    this.syncMeshVisibility();
  }

  getActiveIndex(): number {
    return this.activeIndex;
  }

  getSlotWeaponId(index: number): WeaponId | null {
    return this.slotAssignments[index] ?? null;
  }

  isMeleeEquipped(): boolean {
    return this.meleeEquipped;
  }

  getMeleeWeaponMesh(): THREE.Group | null {
    return this.meleeSlot?.mesh ?? null;
  }

  getActive(): WeaponSlot {
    if (this.meleeEquipped && this.meleeSlot) {
      return this.meleeSlot;
    }

    const weaponId = this.slotAssignments[this.activeIndex];
    if (!weaponId) {
      const fallback = this.slotAssignments.find((id) => id !== null);
      if (fallback) return this.weaponsById.get(fallback)!;
      return this.weaponsById.values().next().value!;
    }
    return this.weaponsById.get(weaponId)!;
  }

  getActiveWeaponId(): WeaponId {
    return this.getActive().config.id;
  }

  getActiveDamage(): number {
    return this.getActive().config.damage;
  }

  getSlot(index: number): WeaponSlot | null {
    const weaponId = this.slotAssignments[index];
    if (!weaponId) return null;
    return this.weaponsById.get(weaponId) ?? null;
  }

  isSlotFilled(index: number): boolean {
    return this.slotAssignments[index] !== null;
  }

  applyServerSlots(snapshot: LoadoutSlotSnapshot, activeWeaponId: string): void {
    this.slotAssignments[0] = parseSlotWeaponId(snapshot.weaponSlot0);
    this.slotAssignments[1] = parseSlotWeaponId(snapshot.weaponSlot1);
    this.slotAssignments[2] = parseSlotWeaponId(snapshot.weaponSlot2);

    const activeWeapon = isWeaponId(activeWeaponId) ? activeWeaponId : null;
    if (activeWeapon === MELEE_WEAPON_ID) {
      this.meleeEquipped = true;
    } else {
      this.meleeEquipped = false;
      const activeSlot = activeWeapon
        ? this.slotAssignments.indexOf(activeWeapon)
        : -1;

      if (activeSlot >= 0) {
        this.activeIndex = activeSlot;
      } else {
        const fallback = this.slotAssignments.findIndex((id) => id !== null);
        if (fallback >= 0) this.activeIndex = fallback;
      }
    }

    this.syncMeshVisibility();
  }

  getAmmoState(): LoadoutAmmoState {
    const active = this.getActive();
    if (this.meleeEquipped) {
      return {
        ...active.ammo.getState(),
        weaponName: active.config.name,
        slotIndex: this.activeIndex,
        meleeEquipped: true,
      };
    }

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

    for (const slot of this.allWeaponSlots()) {
      slot.ammo.update(delta);
    }
  }

  tryEquipMelee(equip: boolean): boolean {
    if (!this.meleeSlot) return false;
    if (equip === this.meleeEquipped) return false;
    if (this.switchCooldown > 0) return false;

    if (!equip) {
      this.meleeEquipped = false;
    } else {
      if (!this.meleeEquipped) {
        this.getActive().ammo.cancelReload();
      }
      this.meleeEquipped = true;
      this.meleeSlot.recoil.reset();
    }

    this.syncMeshVisibility();
    this.switchCooldown = SWITCH_READY_SEC;
    return true;
  }

  trySwitch(slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= LOADOUT_SIZE) return false;
    if (!this.slotAssignments[slotIndex]) return false;
    if (!this.meleeEquipped && slotIndex === this.activeIndex) return false;
    if (this.switchCooldown > 0) return false;

    this.meleeEquipped = false;
    this.getActive().ammo.cancelReload();
    this.activeIndex = slotIndex;
    this.syncMeshVisibility();
    this.getActive().recoil.reset();
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
    for (const slot of this.weaponsById.values()) {
      slot.ammo.refill(reserveRounds);
    }
  }

  setRemoteActiveWeapon(weaponId: WeaponId): void {
    if (weaponId === MELEE_WEAPON_ID) {
      this.meleeEquipped = true;
      this.syncMeshVisibility();
      return;
    }

    const index = this.slotAssignments.indexOf(weaponId);
    if (index < 0) return;

    this.meleeEquipped = false;
    this.activeIndex = index;
    this.syncMeshVisibility();
  }

  setMeshesVisible(visible: boolean): void {
    this.meshesForcedHidden = !visible;
    this.syncMeshVisibility();
  }

  private allWeaponSlots(): WeaponSlot[] {
    const slots = [...this.weaponsById.values()];
    if (this.meleeSlot) slots.push(this.meleeSlot);
    return slots;
  }

  private syncMeshVisibility(): void {
    for (const slot of this.allWeaponSlots()) {
      slot.mesh.visible = false;
    }

    if (this.meshesForcedHidden) return;

    this.getActive().mesh.visible = true;
  }

  reset(): void {
    for (const slot of this.allWeaponSlots()) {
      slot.recoil.reset();
    }
    this.meleeEquipped = false;
    this.switchCooldown = 0;
  }

  dispose(): void {
    for (const slot of this.allWeaponSlots()) {
      slot.dispose();
    }
  }
}
