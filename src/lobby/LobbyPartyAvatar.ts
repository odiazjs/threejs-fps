import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { WeaponId } from '../../shared/content/weaponIds';
import {
  createCharacterInstance,
  resolveCharacterRig,
  type CharacterInstance,
  type CharacterTemplate,
} from '../player/characterModel';
import { remoteWeaponMeshScale } from '../combat/WeaponLoadout';
import { createWeaponMesh } from '../content/weaponMeshes';
import { getRemoteWeaponMount } from '../player/remoteWeaponMount';

export class LobbyPartyAvatar {
  readonly root = new THREE.Group();
  private characterInstance: CharacterInstance | null = null;
  private readonly nameLabel: CSS2DObject;
  private readonly spinPhase: number;

  constructor(
    username: string,
    template: CharacterTemplate,
    weaponId: WeaponId,
    spinPhase = 0,
  ) {
    this.spinPhase = spinPhase;

    const bodyRoot = new THREE.Group();
    bodyRoot.rotation.y = Math.PI;
    this.root.add(bodyRoot);

    this.characterInstance = createCharacterInstance(template);
    bodyRoot.add(this.characterInstance.root);
    this.attachWeapon(template, weaponId);

    const labelRoot = document.createElement('div');
    labelRoot.className = 'lobby-party-name';
    labelRoot.textContent = username;
    this.nameLabel = new CSS2DObject(labelRoot);
    this.nameLabel.position.y = 1.95;
    this.root.add(this.nameLabel);
  }

  setPositionX(x: number): void {
    this.root.position.x = x;
  }

  update(delta: number, elapsed: number): void {
    this.root.rotation.y = Math.sin(elapsed * 0.55 + this.spinPhase) * 0.35;
    this.characterInstance?.update(delta);
  }

  dispose(): void {
    this.characterInstance?.dispose();
    this.characterInstance = null;
    this.nameLabel.removeFromParent();
    this.root.removeFromParent();
  }

  private attachWeapon(template: CharacterTemplate, weaponId: WeaponId): void {
    if (!this.characterInstance) return;

    const rig = resolveCharacterRig(this.characterInstance.root, template.bones);
    if (!rig) return;

    const mount = getRemoteWeaponMount(template.modelFile, weaponId);
    const handRig = new THREE.Group();
    handRig.name = 'lobbyPartyHandRig';
    handRig.position.copy(mount.handPosition);
    handRig.rotation.copy(mount.handRotation);
    rig.rightHand.add(handRig);

    const weapon = createWeaponMesh(weaponId);
    weapon.scale.setScalar(remoteWeaponMeshScale(template.fitScale, weaponId));
    weapon.position.copy(mount.weaponPosition);
    weapon.rotation.copy(mount.weaponRotation);
    weapon.frustumCulled = false;
    handRig.add(weapon);
  }
}

/** X offsets for non-local party members (local player stays at 0). */
export function partyMemberOffsets(otherCount: number): number[] {
  switch (otherCount) {
    case 0:
      return [];
    case 1:
      return [-1.0];
    case 2:
      return [-1.05, 1.05];
    case 3:
      return [-1.35, -0.55, 1.35];
    default:
      return [];
  }
}
