import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';

const FORWARD = new THREE.Vector3(0, 0, -1);

const DEFAULT_BOLT_COLORS: readonly [number, number, number] = [
  MAP_PALETTE.neonCyan,
  0x55eeff,
  0x00b8ff,
];

export interface ProjectileBoltVisualOptions {
  colors?: readonly [number, number, number];
}

/**
 * Cosmetic plasma bolt — travels with the dummy projectile; no gameplay logic.
 */
export class ProjectileBoltVisual {
  readonly object = new THREE.Group();

  private readonly colors: readonly [number, number, number];
  private readonly core: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private readonly trailMeshes: THREE.Mesh[] = [];
  private readonly light: THREE.PointLight;
  private pulse = 0;

  constructor(options: ProjectileBoltVisualOptions = {}) {
    this.colors = options.colors ?? DEFAULT_BOLT_COLORS;
    const [colorA, colorB, colorC] = this.colors;

    const trailOffsets = [0.12, 0.24, 0.36, 0.48];
    for (let i = 0; i < trailOffsets.length; i++) {
      const fade = 0.55 - i * 0.12;
      const trail = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 - i * 0.006, 6, 4),
        new THREE.MeshBasicMaterial({
          color: colorB,
          transparent: true,
          opacity: fade,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      trail.position.z = trailOffsets[i]!;
      this.object.add(trail);
      this.trailMeshes.push(trail);
    }

    this.core = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.028, 0.22, 4, 8),
      new THREE.MeshBasicMaterial({
        color: colorA,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.core.rotation.x = Math.PI / 2;
    this.object.add(this.core);

    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({
        color: colorB,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.object.add(this.glow);

    this.light = new THREE.PointLight(colorC, 0.85, 2.8);
    this.light.decay = 2;
    this.object.add(this.light);
  }

  setPose(position: THREE.Vector3, direction: THREE.Vector3): void {
    this.object.position.copy(position);
    this.object.quaternion.setFromUnitVectors(FORWARD, direction);
  }

  tick(delta: number): void {
    this.pulse += delta * 24;
    const flicker = 0.88 + Math.sin(this.pulse) * 0.12;
    this.light.intensity = 0.85 * flicker;
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.38 + Math.sin(this.pulse * 1.3) * 0.08;
    this.core.scale.set(1, 1 + Math.sin(this.pulse * 2.1) * 0.06, 1);
  }

  dispose(): void {
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
    this.glow.geometry.dispose();
    (this.glow.material as THREE.Material).dispose();
    for (const trail of this.trailMeshes) {
      trail.geometry.dispose();
      (trail.material as THREE.Material).dispose();
    }
    this.object.removeFromParent();
  }
}
