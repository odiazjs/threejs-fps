import * as THREE from 'three';
import type { WeaponConfig } from '../../shared/content/weaponConfig';
import type { WeaponEffectiveStats } from '../../shared/content/weaponUpgrades';
import { withEffectiveWeaponStats, shippedEffectiveStats } from '../../shared/content/applyWeaponEffectiveStats';
import type { WeaponId } from '../../shared/content/weaponIds';
import { isPickableWeaponId, isWeaponId, LOADOUT_SIZE, MELEE_WEAPON_ID } from '../../shared/content/weaponIds';
import type { LoadoutSlotSnapshot } from '../../shared/loadout/loadoutSlots';
import { WeaponAmmo, type AmmoState } from './WeaponAmmo';
import { WeaponFeel } from '../gunfeel/WeaponFeel';
import { createWeaponMesh } from '../content/weaponMeshes';
import { setDigitalSightVisible } from './DigitalSight';

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
  return isPickableWeaponId(raw) ? raw : null;
}

export interface LoadoutAmmoState extends AmmoState {
  weaponName: string;
  slotIndex: number;
  meleeEquipped?: boolean;
}

export class WeaponSlot {
  /** Unmodified catalog config — upgrades are always applied from this base. */
  private readonly baseConfig: WeaponConfig;
  config: WeaponConfig;
  readonly ammo: WeaponAmmo;
  /** Recoil + kickback bundle — per-slot so spring state follows the weapon. */
  readonly feel: WeaponFeel;
  readonly mesh: THREE.Group;

  constructor(config: WeaponConfig) {
    this.baseConfig = config;
    // Apply catalog recoil→camera scale immediately so stock Armory recoil drives kick
    // even before match upgrade sync (and as a fallback if that sync fails).
    this.config = withEffectiveWeaponStats(config, shippedEffectiveStats(config.id));
    this.ammo = new WeaponAmmo(this.config);
    this.feel = new WeaponFeel(this.config.recoil, config.id, config.fireMode === 'auto');
    this.mesh = createWeaponMesh(config.id);
    this.mesh.visible = false;
  }

  get weaponId(): WeaponId {
    return this.baseConfig.id;
  }

  /**
   * Overlay Armory effective stats onto this slot for the current match.
   * Does not reset live recoil — network re-apply must not snap aim mid-fight.
   */
  applyEffectiveStats(stats: WeaponEffectiveStats): void {
    this.config = withEffectiveWeaponStats(this.baseConfig, stats);
    this.ammo.applyConfig(this.config);
    this.feel.setConfig(this.config.recoil);
  }

  get fireInterval(): number {
    // fireRate <= 0 means uncapped (click-limited for semi).
    if (this.config.fireRate <= 0) return 0;
    return 1 / this.config.fireRate;
  }

  dispose(): void {
    this.mesh.traverse((child) => {
      if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.Points ||
        child instanceof THREE.Sprite
      ) {
        if ('geometry' in child && child.geometry) {
          child.geometry.dispose();
        }
        const material = child.material;
        if (Array.isArray(material)) {
          for (const entry of material) entry.dispose();
        } else if (material) {
          material.dispose();
        }
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
    if (configs.length < LOADOUT_SIZE) {
      throw new Error(`Loadout requires at least ${LOADOUT_SIZE} weapons`);
    }
    this.weaponsById = new Map(configs.map((config) => [config.id, new WeaponSlot(config)]));
    // Default numbered slots use the first LOADOUT_SIZE configs (pistol / rifle / sniper).
    this.slotAssignments = configs.slice(0, LOADOUT_SIZE).map((config) => config.id);
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
      // Optics are ADS-only on local FP; always hidden on third-person.
      setDigitalSightVisible(slot.mesh, false);
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
      setDigitalSightVisible(slot.mesh, false);
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

  getActive(): WeaponSlot | null {
    if (this.meleeEquipped && this.meleeSlot) {
      return this.meleeSlot;
    }

    const activeWeaponId = this.slotAssignments[this.activeIndex];
    if (activeWeaponId) {
      const slot = this.resolveSlotForWeaponId(activeWeaponId);
      if (slot) return slot;
    }

    for (const weaponId of this.slotAssignments) {
      if (!weaponId) continue;
      const slot = this.resolveSlotForWeaponId(weaponId);
      if (slot) return slot;
    }

    return null;
  }

  getActiveWeaponId(): WeaponId | null {
    const active = this.getActive();
    return active?.config.id ?? null;
  }

  getActiveDamage(): number {
    return this.getActive()?.config.damage ?? 0;
  }

  /** Apply Armory upgrades to every owned weapon slot for this match. */
  applyEffectiveStatsByWeaponId(statsById: ReadonlyMap<string, WeaponEffectiveStats>): void {
    for (const [weaponId, slot] of this.weaponsById) {
      const stats = statsById.get(weaponId);
      if (stats) slot.applyEffectiveStats(stats);
    }
    if (this.meleeSlot) {
      const stats = statsById.get(this.meleeSlot.weaponId);
      if (stats) this.meleeSlot.applyEffectiveStats(stats);
    }
  }

  getSlot(index: number): WeaponSlot | null {
    const weaponId = this.slotAssignments[index];
    if (!weaponId) return null;
    return this.resolveSlotForWeaponId(weaponId);
  }

  isSlotFilled(index: number): boolean {
    return this.slotAssignments[index] !== null;
  }

  applyServerSlots(snapshot: LoadoutSlotSnapshot, activeWeaponId: string): void {
    this.applyServerSlotAssignments(snapshot);

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

  /** Sync numbered slots only — used while a throwable is equipped locally. */
  applyServerSlotAssignments(snapshot: LoadoutSlotSnapshot): void {
    this.slotAssignments[0] = parseSlotWeaponId(snapshot.weaponSlot0);
    this.slotAssignments[1] = parseSlotWeaponId(snapshot.weaponSlot1);
    this.slotAssignments[2] = parseSlotWeaponId(snapshot.weaponSlot2);
  }

  getAmmoState(): LoadoutAmmoState | null {
    const active = this.getActive();
    if (!active) return null;

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

  tryEquipMelee(
    equip: boolean,
    options?: { bypassCooldown?: boolean; skipSwitchDelay?: boolean },
  ): boolean {
    if (!this.meleeSlot) return false;
    if (equip === this.meleeEquipped) return false;
    if (!options?.bypassCooldown && this.switchCooldown > 0) return false;

    if (!equip) {
      this.meleeEquipped = false;
      if (!this.slotAssignments[this.activeIndex]) {
        const fallback = this.slotAssignments.findIndex((id) => id !== null);
        if (fallback >= 0) this.activeIndex = fallback;
      }
    } else {
      const previous = this.getActive();
      if (previous && !this.meleeEquipped) {
        previous.ammo.cancelReload();
      }
      this.meleeEquipped = true;
      this.meleeSlot.feel.reset();
    }

    this.syncMeshVisibility();
    this.switchCooldown = options?.skipSwitchDelay ? 0 : SWITCH_READY_SEC;
    return true;
  }

  trySwitch(slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= LOADOUT_SIZE) return false;
    const weaponId = this.slotAssignments[slotIndex];
    if (!weaponId || weaponId === MELEE_WEAPON_ID) return false;
    if (!this.resolveSlotForWeaponId(weaponId)) return false;
    if (!this.meleeEquipped && slotIndex === this.activeIndex) return false;
    if (this.switchCooldown > 0) return false;

    this.meleeEquipped = false;
    const previous = this.getActive();
    previous?.ammo.cancelReload();
    this.activeIndex = slotIndex;
    this.syncMeshVisibility();
    this.getActive()?.feel.reset();
    this.switchCooldown = SWITCH_READY_SEC;
    return true;
  }

  applyActiveRotation(baseRotation: THREE.Euler, context: WeaponMeshContext): void {
    const active = this.getActive();
    if (!active) return;
    applyWeaponMeshRotation(active.mesh, baseRotation, active.config.view, context);
  }

  addReserveToActive(): void {
    this.getActive()?.ammo.addReserveClip();
  }

  refillAllAmmo(reserveRounds?: number): void {
    for (const slot of this.weaponsById.values()) {
      slot.ammo.refill(reserveRounds);
    }
  }

  cancelAllReloads(): void {
    for (const slot of this.allWeaponSlots()) {
      slot.ammo.cancelReload();
    }
  }

  /** Full ammo + combat timing reset when the server respawns the player. */
  resetForRespawn(reserveRounds?: number): void {
    for (const slot of this.allWeaponSlots()) {
      slot.ammo.refill(reserveRounds);
      slot.feel.reset();
    }
    this.meleeEquipped = false;
    this.switchCooldown = 0;
    this.syncMeshVisibility();
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

  /** Katana is only available via `meleeSlot` (X key), never numbered slots. */
  private resolveSlotForWeaponId(weaponId: WeaponId): WeaponSlot | null {
    if (weaponId === MELEE_WEAPON_ID) {
      return this.meleeSlot;
    }
    return this.weaponsById.get(weaponId) ?? null;
  }

  private syncMeshVisibility(): void {
    for (const slot of this.allWeaponSlots()) {
      slot.mesh.visible = false;
    }

    if (this.meshesForcedHidden) return;

    const active = this.getActive();
    if (active) {
      active.mesh.visible = true;
    }
  }

  reset(): void {
    for (const slot of this.allWeaponSlots()) {
      slot.feel.reset();
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
