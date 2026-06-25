import * as THREE from 'three';
import {
  createCharacterInstance,
  loadLobbyCharacterTemplate,
  resolveCharacterRig,
  type CharacterInstance,
  type CharacterTemplate,
} from '../player/characterModel';
import { remoteWeaponMeshScale } from '../combat/WeaponLoadout';
import { createWeaponMesh, preloadWeaponMeshes } from '../content/weaponMeshes';
import { getRemoteWeaponMount } from '../player/remoteWeaponMount';
import { createSkyboxTexture } from '../world/SkyboxBuilder';
import { addEdgeLines, updateEdgeLinesForCamera, updateLineResolution } from '../visuals/edgeLines';
import { GrassField } from '../world/GrassField';
import { createDroneVisual } from '../world/DroneField';
import { PerformanceHud } from '../ui/PerformanceHud';

export class LobbyScene {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly avatar = new THREE.Group();
  private characterInstance: CharacterInstance | null = null;
  private weaponMesh: THREE.Group | null = null;
  private readonly grassField: GrassField;
  private readonly droneRoot: THREE.Group;
  private readonly dronePropellers: THREE.Group[];
  private readonly clock = new THREE.Clock();
  private readonly performanceHud = new PerformanceHud();
  private animationId = 0;

  constructor(container: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 1.45, 3.2);
    this.camera.lookAt(0, 1.1, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.scene.background = createSkyboxTexture();

    const hemi = new THREE.HemisphereLight(0xb8d4e8, 0x2a3038, 1.1);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(2.5, 4, 3);
    const rim = new THREE.DirectionalLight(0x82dbdb, 0.55);
    rim.position.set(-2, 2, -2);
    this.scene.add(hemi, key, rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 48),
      new THREE.MeshStandardMaterial({
        color: 0x48b440,
        metalness: 0.05,
        roughness: 0.92,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    addEdgeLines(floor);
    this.scene.add(floor);

    this.grassField = new GrassField(() => 0, {
      halfExtent: 3.2,
      maxBlades: 14_500,
      gridStep: 0.08,
      bladeHeight: 0.22,
      bladeWidth: 0.026,
      extraBladeChance: 0.78,
      skipPatches: false,
      seed: 0x10bb3,
      sunDirection: new THREE.Vector3(2.5, 4, 3),
    });
    this.scene.add(this.grassField.mesh);

    const drone = createDroneVisual();
    this.droneRoot = drone.root;
    this.droneRoot.scale.setScalar(0.42);
    this.dronePropellers = drone.propellers;
    this.scene.add(this.droneRoot);

    const bodyRoot = new THREE.Group();
    bodyRoot.rotation.y = Math.PI;
    this.avatar.add(bodyRoot);
    void Promise.all([loadLobbyCharacterTemplate(), preloadWeaponMeshes()])
      .then(([template]) => {
        this.characterInstance = createCharacterInstance(template);
        bodyRoot.add(this.characterInstance.root);
        this.attachLobbyWeapon(template);
      })
      .catch((error) => {
        console.warn('[LobbyScene] Failed to load lobby assets', error);
      });

    this.scene.add(this.avatar);

    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.loop();
  }

  private loop = (): void => {
    this.animationId = requestAnimationFrame(this.loop);
    const delta = this.clock.getDelta();
    const t = this.clock.getElapsedTime();
    this.avatar.rotation.y = Math.sin(t * 0.55) * 0.35;
    this.characterInstance?.update(delta);
    this.grassField.update(t, { cameraPos: this.camera.position });

    const orbitAngle = t * 0.72;
    this.droneRoot.position.set(
      Math.cos(orbitAngle) * 1.35,
      2.05 + Math.sin(t * 1.25) * 0.28,
      -0.35 + Math.sin(orbitAngle) * 0.95,
    );
    this.droneRoot.rotation.y = orbitAngle + Math.PI * 0.55;
    this.droneRoot.rotation.z = Math.sin(orbitAngle * 1.4) * 0.14;

    const spin = t * 28;
    for (let i = 0; i < this.dronePropellers.length; i++) {
      this.dronePropellers[i]!.rotation.y = spin * (i % 2 === 0 ? 1 : -1);
    }

    updateEdgeLinesForCamera(this.camera);
    this.renderer.render(this.scene, this.camera);
    this.performanceHud.update(delta, this.renderer);
  };

  private attachLobbyWeapon(template: CharacterTemplate): void {
    if (!this.characterInstance) return;

    const rig = resolveCharacterRig(this.characterInstance.root, template.bones);
    if (!rig) {
      console.warn('[LobbyScene] Character hand bone not found');
      return;
    }

    const mount = getRemoteWeaponMount(template.modelFile, 'plasma_rifle');
    const handRig = new THREE.Group();
    handRig.name = 'lobbyHandRig';
    handRig.position.copy(mount.handPosition);
    handRig.rotation.copy(mount.handRotation);
    rig.rightHand.add(handRig);

    const weapon = createWeaponMesh('plasma_rifle');
    weapon.scale.setScalar(remoteWeaponMeshScale(template.fitScale));
    weapon.position.copy(mount.weaponPosition);
    weapon.rotation.copy(mount.weaponRotation);
    weapon.frustumCulled = false;
    handRig.add(weapon);
    this.weaponMesh = weapon;
  }

  private onResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;

    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    updateLineResolution(w, h);
  };

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onResize);
    this.characterInstance?.dispose();
    this.characterInstance = null;
    this.weaponMesh?.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.weaponMesh?.removeFromParent();
    this.weaponMesh = null;
    this.grassField.dispose();
    this.performanceHud.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
