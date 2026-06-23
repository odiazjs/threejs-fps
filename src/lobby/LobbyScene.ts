import * as THREE from 'three';
import { createWeapon } from '../content/weapon';
import { createRemoteHead, createRemoteTorso } from '../player/RemoteAvatar';
import { createSkyboxTexture } from '../world/SkyboxBuilder';
import { addEdgeLines } from '../visuals/edgeLines';

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
      new THREE.CircleGeometry(2.2, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1a2028,
        metalness: 0.2,
        roughness: 0.85,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    addEdgeLines(floor);
    this.scene.add(floor);

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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
