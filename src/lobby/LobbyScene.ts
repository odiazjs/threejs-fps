import * as THREE from 'three';
import { createWeapon } from '../content/weapon';
import { createRemoteHead, createRemoteTorso } from '../player/RemoteAvatar';
import { createSkyboxTexture } from '../world/SkyboxBuilder';
import { addEdgeLines } from '../visuals/edgeLines';
import { GrassField } from '../world/GrassField';
import { createDroneVisual } from '../world/DroneField';
import { MAP_PALETTE } from '../../shared/level/mapPalette';

const TEAM_COLOR = 0x6a9fd4;

/** Right-hand grip on torso (+X), neutral forward (-Z). */
const WEAPON_HAND_OFFSET = new THREE.Vector3(0.34, 0.74, 0.02);
/** Nudge so the grip mesh sits in the hand after barrel-up alignment. */
const WEAPON_GRIP_OFFSET = new THREE.Vector3(0.02, -0.1, 0);

const _barrelAxis = new THREE.Vector3(1, 0, 0);
const _skyAxis = new THREE.Vector3(0, 1, 0);
const _tiltAxis = new THREE.Vector3(0, 1, 0);
const _alignQuat = new THREE.Quaternion();
const _tiltQuat = new THREE.Quaternion();

function applyLobbyWeaponPose(weapon: THREE.Group): void {
  _alignQuat.setFromUnitVectors(_barrelAxis, _skyAxis);
  _tiltQuat.setFromAxisAngle(_tiltAxis, -0.18);
  weapon.quaternion.copy(_tiltQuat).multiply(_alignQuat);
  weapon.position.copy(WEAPON_GRIP_OFFSET);
}

export class LobbyScene {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly avatar = new THREE.Group();
  private readonly grassField: GrassField;
  private readonly droneRoot: THREE.Group;
  private readonly dronePropellers: THREE.Group[];
  private readonly clock = new THREE.Clock();
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
        color: MAP_PALETTE.grassDark,
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
      maxBlades: 4_200,
      gridStep: 0.2,
      skipPatches: false,
      seed: 0x10bb3,
    });
    this.scene.add(this.grassField.mesh);

    const drone = createDroneVisual();
    this.droneRoot = drone.root;
    this.dronePropellers = drone.propellers;
    this.scene.add(this.droneRoot);

    const bodyRoot = new THREE.Group();
    bodyRoot.add(createRemoteTorso(TEAM_COLOR));
    this.avatar.add(bodyRoot);

    const handRig = new THREE.Group();
    handRig.position.copy(WEAPON_HAND_OFFSET);
    bodyRoot.add(handRig);

    const weapon = createWeapon();
    applyLobbyWeaponPose(weapon);
    handRig.add(weapon);

    const lookRig = new THREE.Group();
    lookRig.position.y = 1.54;
    lookRig.add(createRemoteHead(TEAM_COLOR));
    this.avatar.add(lookRig);

    this.scene.add(this.avatar);

    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.loop();
  }

  private loop = (): void => {
    this.animationId = requestAnimationFrame(this.loop);
    const t = this.clock.getElapsedTime();
    this.avatar.rotation.y = Math.sin(t * 0.55) * 0.35;
    this.grassField.update(t);

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

    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;

    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onResize);
    this.grassField.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
