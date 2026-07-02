import * as THREE from 'three';
import type { MapCollisionDef } from '../../shared/level/maps';

const FOLLOW_DISTANCE = 11;
const FOLLOW_HEIGHT = 9;
const LOOK_AT_HEIGHT = 1.45;
const SMOOTH_RATE = 10;

export class KillCam {
  readonly camera: THREE.PerspectiveCamera;
  private active = false;
  private targetId: string | null = null;
  private readonly smoothPosition = new THREE.Vector3();
  private followInitialized = false;
  private mapFallback = false;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
  }

  configureForMap(mapDef: MapCollisionDef): void {
    if (this.active && !this.mapFallback) return;

    const span = Math.max(mapDef.mapHalfX, mapDef.mapHalfZ);
    const altitude = span * 1.35;
    const lookOffset = altitude;

    this.camera.position.set(0, altitude, 0);
    this.camera.lookAt(0, 0, lookOffset);
    this.camera.updateProjectionMatrix();
  }

  activate(killerId: string | null): void {
    this.targetId = killerId;
    this.active = true;
    this.followInitialized = false;
    this.mapFallback = !killerId;
  }

  deactivate(): void {
    this.active = false;
    this.targetId = null;
    this.followInitialized = false;
    this.mapFallback = false;
  }

  isActive(): boolean {
    return this.active;
  }

  getTargetId(): string | null {
    return this.targetId;
  }

  updateFollow(
    feetX: number,
    feetY: number,
    feetZ: number,
    yaw: number,
    delta: number,
  ): void {
    this.mapFallback = false;

    const backX = -Math.sin(yaw) * FOLLOW_DISTANCE;
    const backZ = -Math.cos(yaw) * FOLLOW_DISTANCE;
    const desiredX = feetX + backX;
    const desiredY = feetY + FOLLOW_HEIGHT;
    const desiredZ = feetZ + backZ;

    if (!this.followInitialized) {
      this.smoothPosition.set(desiredX, desiredY, desiredZ);
      this.followInitialized = true;
    } else {
      const blend = 1 - Math.exp(-SMOOTH_RATE * delta);
      this.smoothPosition.x += (desiredX - this.smoothPosition.x) * blend;
      this.smoothPosition.y += (desiredY - this.smoothPosition.y) * blend;
      this.smoothPosition.z += (desiredZ - this.smoothPosition.z) * blend;
    }

    this.camera.position.copy(this.smoothPosition);
    this.camera.lookAt(feetX, feetY + LOOK_AT_HEIGHT, feetZ);
  }

  useMapFallback(): void {
    this.mapFallback = true;
    this.followInitialized = false;
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
