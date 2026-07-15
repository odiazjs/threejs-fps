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
  getBoltHaloTexture,
  getBoltTrailGeometry,
} from './boltVisualShared';

const FORWARD = new THREE.Vector3(0, 0, -1);
const TRAIL_COUNT = 4;

const _hotColor = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);

export type ProjectileBoltStyle = 'bolt' | 'bioLiquid';

export interface ProjectileBoltVisualOptions {
  colors?: readonly [number, number, number];
  style?: ProjectileBoltStyle;
  /** Uniform scale on the whole bolt (shotgun pellets run smaller). */
  sizeScale?: number;
}

/**
 * Plasma bolt or viscous bio-liquid blob — reuses shared geometry/materials.
 *
 * Bolt style = luminous tracer: white-hot core capsule, weapon-tinted glow
 * shell, a camera-facing halo sprite (fake bloom — no post-processing pass
 * needed), and a long tapered tail that sells the flight speed.
 */
export class ProjectileBoltVisual {
  readonly object = new THREE.Group();

  private readonly boltCore: THREE.Mesh;
  private readonly boltGlow: THREE.Mesh;
  private readonly boltHalo: THREE.Sprite;
  private readonly boltTrail: THREE.Mesh;
  private readonly blobCore: THREE.Mesh;
  private readonly blobHalo: THREE.Mesh;
  private readonly trail: THREE.Mesh[] = [];

  private style: ProjectileBoltStyle = 'bolt';
  private pulse = 0;

  constructor(_options: ProjectileBoltVisualOptions = {}) {
    // Per-instance material clones so each weapon's colors tint its tracer
    // (instances are pooled — see PROJECTILE_POOL_SIZE — so this stays cheap).
    this.boltCore = new THREE.Mesh(getBoltCoreGeometry(), getBoltCoreMaterial().clone());
    this.boltCore.rotation.x = Math.PI / 2;
    this.boltCore.scale.setScalar(1.5);
    this.object.add(this.boltCore);

    this.boltGlow = new THREE.Mesh(getBoltGlowGeometry(), getBoltGlowMaterial().clone());
    this.boltGlow.scale.setScalar(2.0);
    this.object.add(this.boltGlow);

    this.boltHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getBoltHaloTexture(),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.boltHalo.scale.setScalar(0.82);
    this.object.add(this.boltHalo);

    this.boltTrail = new THREE.Mesh(
      getBoltTrailGeometry(),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    // Trail geometry is authored along +Y; tilt it to trail behind (+Z).
    this.boltTrail.rotation.x = Math.PI / 2;
    this.object.add(this.boltTrail);

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
    // Pooled — always reset so pellet scale never leaks into the next shot.
    this.object.scale.setScalar(options.sizeScale ?? 1);

    const isBlob = this.style === 'bioLiquid';
    this.boltCore.visible = !isBlob;
    this.boltGlow.visible = !isBlob;
    this.boltHalo.visible = !isBlob;
    this.boltTrail.visible = !isBlob;
    this.blobCore.visible = isBlob;
    this.blobHalo.visible = isBlob;

    for (const droplet of this.trail) {
      droplet.visible = isBlob;
    }

    if (isBlob) {
      if (options.colors) {
        (this.blobCore.material as THREE.MeshBasicMaterial).color.setHex(options.colors[0]!);
        (this.blobHalo.material as THREE.MeshBasicMaterial).color.setHex(options.colors[1]!);
        for (const droplet of this.trail) {
          (droplet.material as THREE.MeshBasicMaterial).color.setHex(options.colors[2]!);
        }
      }
      return;
    }

    // Weapon-tinted tracer: white-hot center, colored glow/halo/tail.
    const [colorA, colorB, colorC] = options.colors ?? [0x00f2ff, 0x55eeff, 0x00b8ff];
    _hotColor.setHex(colorA).lerp(WHITE, 0.6);
    (this.boltCore.material as THREE.MeshBasicMaterial).color.copy(_hotColor);
    (this.boltGlow.material as THREE.MeshBasicMaterial).color.setHex(colorB);
    (this.boltHalo.material as THREE.SpriteMaterial).color.setHex(colorB);
    (this.boltTrail.material as THREE.MeshBasicMaterial).color.setHex(colorC);
    // Trail stretches in as the bolt leaves the muzzle (see tick).
    this.boltTrail.scale.set(1, 0.1, 1);
  }

  setPose(position: THREE.Vector3, direction: THREE.Vector3): void {
    this.object.position.copy(position);
    this.object.quaternion.setFromUnitVectors(FORWARD, direction);
  }

  tick(delta: number): void {
    if (this.style !== 'bioLiquid') {
      // Tail grows to full length over the first frames of flight; the halo
      // flickers slightly so the bolt reads as burning energy, not a decal.
      this.pulse += delta * 30;
      const stretch = Math.min(1, this.boltTrail.scale.y + delta * 9);
      this.boltTrail.scale.y = stretch;
      this.boltHalo.scale.setScalar(0.82 + Math.sin(this.pulse) * 0.07);
      return;
    }

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
    // Geometries + halo texture are shared; only instance materials go.
    (this.boltCore.material as THREE.Material).dispose();
    (this.boltGlow.material as THREE.Material).dispose();
    this.boltHalo.material.dispose();
    (this.boltTrail.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}
