import * as THREE from 'three';
import { EYE_HEIGHT, stepPlayerPhysics, type PlayerPhysicsState } from '../../shared/level/collision';
import { createWeapon } from '../content/weapon';
import type { KeyboardInput } from '../input/KeyboardInput';
import type { PlayerSnapshot } from '../network/types';
import { createToonMaterial } from '../visuals/toonMaterial';
import { addEdgeLines } from '../visuals/edgeLines';
import { SPRINT_MULTIPLIER, SprintStamina, type SprintState } from './SprintStamina';
import { HeadBob } from './HeadBob';

const MOVE_SPEED = 5;
const REMOTE_INTERPOLATION_SPEED = 12;
const WEAPON_OFFSET = new THREE.Vector3(0.15, -0.18, -0.35);
const WEAPON_ROTATION = new THREE.Euler(0, -Math.PI / 2, 0);

function lerpAngle(from: number, to: number, t: number): number {
  const delta = THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
  return from + delta * t;
}

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
  private aimRig: THREE.Group | null = null;

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
      this.attachWeapon(this.camera);
    } else {
      this.camera = null;
      this.aimRig = new THREE.Group();
      this.aimRig.position.set(0, EYE_HEIGHT, 0);
      this.object.add(this.createBodyMesh(bodyColor));
      this.object.add(this.aimRig);
      this.attachWeapon(this.aimRig);
    }
  }

  static createLocal(): Player {
    return new Player(true);
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

  setEyePosition(x: number, y: number, z: number): void {
    this.object.position.set(x, y - EYE_HEIGHT, z);
    this.physics = { verticalVelocity: 0, grounded: true };
    this.headBob.reset();
    if (this.headRig) this.headBob.apply(this.headRig, false);
    if (this.camera) this.camera.rotation.z = 0;
  }

  setFromSnapshot(snapshot: PlayerSnapshot, snap = false): void {
    this.targetPosition.set(snapshot.x, snapshot.y - EYE_HEIGHT, snapshot.z);
    this.targetYaw = snapshot.yaw;
    this.targetPitch = snapshot.pitch;

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

  update(delta: number, input: KeyboardInput, canMove: boolean): void {
    if (!this.camera) return;

    if (!canMove) {
      this.headBob.update(delta, false, false);
      if (this.headRig) this.headBob.apply(this.headRig, false);
      return;
    }

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
    this.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.object.removeFromParent();
  }

  private applyRemoteAim(): void {
    if (!this.aimRig) return;

    this.object.rotation.set(0, this.currentYaw, 0);
    this.aimRig.rotation.set(this.currentPitch, 0, 0);
  }

  private createBodyMesh(color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.6, 0.6),
      createToonMaterial(color),
    );
    mesh.position.y = 0.8;
    addEdgeLines(mesh);
    return mesh;
  }

  private attachWeapon(parent: THREE.Object3D): void {
    parent.add(this.weapon);
    this.weapon.position.copy(WEAPON_OFFSET);
    this.weapon.rotation.copy(WEAPON_ROTATION);
  }
}
