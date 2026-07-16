import * as THREE from 'three';
import { SHIELD_DOME_RADIUS } from '../../shared/combat/shieldDomeAbility';
import { acquireFxLight, releaseFxLight } from './FxLightPool';
import { createHexShieldMaterial } from './shieldHexMaterial';

const DOME_COLOR = 0x00f0ff;
const DOME_COLOR_BRIGHT = 0xd8ffff;
const HEMISPHERE_SEGMENTS = { width: 48, height: 24 };

function createHemisphereGeometry(radius: number): THREE.SphereGeometry {
  return new THREE.SphereGeometry(
    radius,
    HEMISPHERE_SEGMENTS.width,
    HEMISPHERE_SEGMENTS.height,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
}

function createAdditiveShellMaterial(color: number, opacity: number, side: THREE.Side): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side,
    toneMapped: false,
  });
}

export class ShieldDomeFx {
  readonly object = new THREE.Group();

  private readonly material;
  private readonly hexMesh: THREE.Mesh;
  private readonly fillMesh: THREE.Mesh;
  private readonly rimMesh: THREE.Mesh;
  private readonly baseRing: THREE.Mesh;
  private readonly fillMaterial: THREE.MeshBasicMaterial;
  private readonly rimMaterial: THREE.MeshBasicMaterial;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  /** Borrowed from FxLightPool — adding lights at runtime recompiles all lit shaders. */
  private light: THREE.PointLight | null = null;
  private elapsed = 0;

  constructor(centerX: number, centerY: number, centerZ: number) {
    this.material = createHexShieldMaterial({ intensity: 1.35 });
    this.material.uniforms.uColor.value.setHex(DOME_COLOR);
    this.material.uniforms.uColorBright.value.setHex(DOME_COLOR_BRIGHT);
    this.material.uniforms.uAlpha.value = 0.72;
    this.material.uniforms.uExpand.value = 1;

    this.fillMaterial = createAdditiveShellMaterial(DOME_COLOR, 0.09, THREE.DoubleSide);
    this.fillMesh = new THREE.Mesh(createHemisphereGeometry(SHIELD_DOME_RADIUS * 0.97), this.fillMaterial);
    this.object.add(this.fillMesh);

    this.rimMaterial = createAdditiveShellMaterial(DOME_COLOR_BRIGHT, 0.16, THREE.BackSide);
    this.rimMesh = new THREE.Mesh(createHemisphereGeometry(SHIELD_DOME_RADIUS * 1.03), this.rimMaterial);
    this.object.add(this.rimMesh);

    this.hexMesh = new THREE.Mesh(createHemisphereGeometry(SHIELD_DOME_RADIUS), this.material);
    this.object.add(this.hexMesh);

    this.ringMaterial = createAdditiveShellMaterial(DOME_COLOR_BRIGHT, 0.22, THREE.DoubleSide);
    this.baseRing = new THREE.Mesh(
      new THREE.RingGeometry(SHIELD_DOME_RADIUS * 0.88, SHIELD_DOME_RADIUS * 1.04, 72),
      this.ringMaterial,
    );
    this.baseRing.rotation.x = -Math.PI / 2;
    this.baseRing.position.y = 0.02;
    this.object.add(this.baseRing);

    this.object.position.set(centerX, centerY, centerZ);

    this.light = acquireFxLight(DOME_COLOR_BRIGHT, SHIELD_DOME_RADIUS * 4);
    if (this.light) {
      this.light.position.set(centerX, centerY + SHIELD_DOME_RADIUS * 0.5, centerZ);
      this.light.intensity = 1.4;
    }
  }

  /** Hide a prewarm-only instance and return its borrowed light to the pool. */
  parkForPrewarm(): void {
    this.object.visible = false;
    releaseFxLight(this.light);
    this.light = null;
  }

  update(delta: number, camera: THREE.Camera | null): void {
    this.elapsed += delta;
    const pulse = 0.9 + Math.sin(this.elapsed * 4.8) * 0.08;
    this.material.uniforms.uTime.value = this.elapsed;
    this.material.uniforms.uAlpha.value = 0.58 + pulse * 0.12;

    const shellOpacity = 0.07 + pulse * 0.04;
    this.fillMaterial.opacity = shellOpacity;
    this.rimMaterial.opacity = 0.12 + pulse * 0.05;
    this.ringMaterial.opacity = 0.16 + pulse * 0.06;
    if (this.light) this.light.intensity = 1.0 + pulse * 0.35;

    if (camera) {
      this.material.uniforms.uCameraPos.value.copy(camera.position);
    }
  }

  dispose(): void {
    releaseFxLight(this.light);
    this.light = null;
    this.hexMesh.geometry.dispose();
    this.fillMesh.geometry.dispose();
    this.rimMesh.geometry.dispose();
    this.baseRing.geometry.dispose();
    this.material.dispose();
    this.fillMaterial.dispose();
    this.rimMaterial.dispose();
    this.ringMaterial.dispose();
    this.object.removeFromParent();
  }
}
