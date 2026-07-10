import * as THREE from 'three';
import {
  getBioLiquidCoreGeometry,
  getBioLiquidCoreMaterial,
  getBioLiquidHaloGeometry,
  getBioLiquidHaloMaterial,
  getBioLiquidTrailGeometry,
  getBioLiquidTrailMaterial,
} from './bioLiquidBoltShared';
import {
  getBoltCoreGeometry,
  getBoltCoreMaterial,
  getBoltGlowGeometry,
  getBoltGlowMaterial,
} from './boltVisualShared';

const FORWARD = new THREE.Vector3(0, 0, -1);
const TRAIL_COUNT = 4;

export type ProjectileBoltStyle = 'bolt' | 'bioLiquid';

export interface ProjectileBoltVisualOptions {
  colors?: readonly [number, number, number];
  style?: ProjectileBoltStyle;
}

/**
 * Plasma bolt or viscous bio-liquid blob — reuses shared geometry/materials.
 */
export class ProjectileBoltVisual {
  readonly object = new THREE.Group();

  private readonly boltCore: THREE.Mesh;
  private readonly boltGlow: THREE.Mesh;
  private readonly blobCore: THREE.Mesh;
  private readonly blobHalo: THREE.Mesh;
  private readonly trail: THREE.Mesh[] = [];

  private style: ProjectileBoltStyle = 'bolt';
  private pulse = 0;

  constructor(_options: ProjectileBoltVisualOptions = {}) {
    this.boltCore = new THREE.Mesh(getBoltCoreGeometry(), getBoltCoreMaterial());
    this.boltCore.rotation.x = Math.PI / 2;
    this.object.add(this.boltCore);

    this.boltGlow = new THREE.Mesh(getBoltGlowGeometry(), getBoltGlowMaterial());
    this.object.add(this.boltGlow);

    this.blobCore = new THREE.Mesh(getBioLiquidCoreGeometry(), getBioLiquidCoreMaterial().clone());
    this.blobHalo = new THREE.Mesh(getBioLiquidHaloGeometry(), getBioLiquidHaloMaterial().clone());
    this.blobCore.visible = false;
    this.blobHalo.visible = false;
    this.object.add(this.blobCore);
    this.object.add(this.blobHalo);

    for (let i = 0; i < TRAIL_COUNT; i++) {
      const droplet = new THREE.Mesh(
        getBioLiquidTrailGeometry(),
        getBioLiquidTrailMaterial().clone(),
      );
      droplet.visible = false;
      // Local +Z is behind the blob (FORWARD is -Z).
      droplet.position.set(0, -0.02 * (i + 1), 0.08 + i * 0.09);
      droplet.scale.setScalar(1 - i * 0.18);
      this.object.add(droplet);
      this.trail.push(droplet);
    }
  }

  configure(options: ProjectileBoltVisualOptions = {}): void {
    this.style = options.style ?? 'bolt';
    this.pulse = 0;

    const isBlob = this.style === 'bioLiquid';
    this.boltCore.visible = !isBlob;
    this.boltGlow.visible = !isBlob;
    this.blobCore.visible = isBlob;
    this.blobHalo.visible = isBlob;

    for (const droplet of this.trail) {
      droplet.visible = isBlob;
    }

    if (isBlob && options.colors) {
      (this.blobCore.material as THREE.MeshBasicMaterial).color.setHex(options.colors[0]!);
      (this.blobHalo.material as THREE.MeshBasicMaterial).color.setHex(options.colors[1]!);
      for (const droplet of this.trail) {
        (droplet.material as THREE.MeshBasicMaterial).color.setHex(options.colors[2]!);
      }
    }
  }

  setPose(position: THREE.Vector3, direction: THREE.Vector3): void {
    this.object.position.copy(position);
    this.object.quaternion.setFromUnitVectors(FORWARD, direction);
  }

  tick(delta: number): void {
    if (this.style !== 'bioLiquid') return;

    this.pulse += delta * 9;
    const breathe = 1 + Math.sin(this.pulse) * 0.14;
    const squash = 1 + Math.sin(this.pulse * 1.7) * 0.1;
    this.blobCore.scale.set(breathe * 0.92, breathe * squash, breathe * 1.18);
    this.blobHalo.scale.setScalar(breathe * 1.08);

    for (let i = 0; i < this.trail.length; i++) {
      const droplet = this.trail[i]!;
      const wobble = Math.sin(this.pulse * 1.3 + i * 0.9) * 0.012;
      droplet.position.x = wobble;
      droplet.position.y = -0.02 * (i + 1) - Math.abs(wobble) * 0.5;
      (droplet.material as THREE.MeshBasicMaterial).opacity = 0.7 - i * 0.12;
    }
  }

  dispose(): void {
    this.object.removeFromParent();
  }
}
