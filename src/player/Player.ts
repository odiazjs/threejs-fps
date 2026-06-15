import * as THREE from 'three';
import { movePlayer } from '../../shared/level/collision';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import { createWeapon } from '../content/weapon';
import type { KeyboardInput } from '../input/KeyboardInput';
import type { PlayerSnapshot } from '../network/types';
import { createToonMaterial } from '../visuals/toonMaterial';
import { addEdgeLines } from '../visuals/edgeLines';

const MOVE_SPEED = 5;
const REMOTE_INTERPOLATION_SPEED = 12;
const WEAPON_OFFSET = new THREE.Vector3(0.15, -0.18, -0.35);

export class Player {
  readonly object = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera | null;

  private weapon = createWeapon();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private targetPosition = new THREE.Vector3();
  private targetYaw = 0;

  private constructor(local: boolean, bodyColor = 0x6a9fd4) {
    if (local) {
      this.camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000,
      );
      this.camera.position.set(0, EYE_HEIGHT, 0);
      this.object.add(this.camera);
      this.attachWeapon();
    } else {
      this.camera = null;
      this.object.add(this.createBodyMesh(bodyColor));
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

  setFromSnapshot(snapshot: PlayerSnapshot, snap = false): void {
    this.targetPosition.set(snapshot.x, snapshot.y - EYE_HEIGHT, snapshot.z);
    this.targetYaw = snapshot.yaw;
    if (snap) {
      this.object.position.copy(this.targetPosition);
      this.object.rotation.y = this.targetYaw;
    }
  }

  interpolateRemote(delta: number): void {
    if (this.camera) return;

    const t = 1 - Math.exp(-REMOTE_INTERPOLATION_SPEED * delta);
    this.object.position.lerp(this.targetPosition, t);
    this.object.rotation.y = THREE.MathUtils.lerp(this.object.rotation.y, this.targetYaw, t);
  }

  update(delta: number, input: KeyboardInput, canMove: boolean): void {
    if (!this.camera || !canMove) return;

    const speed = MOVE_SPEED * delta;

    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();

    this.right.crossVectors(this.forward, this.camera.up).normalize();

    let deltaX = 0;
    let deltaZ = 0;

    if (input.isPressed('KeyW')) {
      deltaX += this.forward.x * speed;
      deltaZ += this.forward.z * speed;
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

    if (deltaX === 0 && deltaZ === 0) return;

    const resolved = movePlayer(
      this.object.position.x,
      this.object.position.y,
      this.object.position.z,
      deltaX,
      deltaZ,
    );
    this.object.position.set(resolved.x, resolved.y, resolved.z);
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

  private createBodyMesh(color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.6, 0.6),
      createToonMaterial(color),
    );
    mesh.position.y = 0.8;
    addEdgeLines(mesh);
    return mesh;
  }

  private attachWeapon(): void {
    if (!this.camera) return;
    this.camera.add(this.weapon);
    this.weapon.position.copy(WEAPON_OFFSET);
    this.weapon.rotation.set(0, -Math.PI / 2, 0);
  }
}
