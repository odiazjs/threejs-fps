import * as THREE from 'three';

/** How long a bullet hole stays on the wall. */
export const BULLET_HOLE_TTL_SEC = 7;
/** Fade-out window at the end of the TTL. */
const FADE_OUT_SEC = 1.4;
/** Hard cap — oldest hole is recycled when the map is peppered. */
const MAX_BULLET_HOLES = 48;
/** Lift off the surface to dodge z-fighting (paired with polygonOffset). */
const SURFACE_OFFSET = 0.012;
const BASE_SIZE = 0.16;

const _forward = new THREE.Vector3(0, 0, 1);
const _quat = new THREE.Quaternion();
const _rollQuat = new THREE.Quaternion();

let holeTexture: THREE.CanvasTexture | null = null;
let sharedGeometry: THREE.PlaneGeometry | null = null;

/**
 * Scorched plasma burn: black charred core, dark soot falloff, and a thin
 * hot cyan ring that reads as still-glowing residue.
 */
function getBulletHoleTexture(): THREE.CanvasTexture {
  if (!holeTexture) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const c = size / 2;

    const soot = ctx.createRadialGradient(c, c, 0, c, c, c);
    soot.addColorStop(0, 'rgba(0, 0, 0, 0.98)');
    soot.addColorStop(0.3, 'rgba(4, 8, 10, 0.92)');
    soot.addColorStop(0.55, 'rgba(8, 12, 16, 0.55)');
    soot.addColorStop(0.8, 'rgba(10, 14, 18, 0.18)');
    soot.addColorStop(1, 'rgba(10, 14, 18, 0)');
    ctx.fillStyle = soot;
    ctx.fillRect(0, 0, size, size);

    // Irregular char blotches so holes don't look like perfect stamps.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    for (let i = 0; i < 7; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = size * (0.18 + Math.random() * 0.16);
      const blotch = size * (0.05 + Math.random() * 0.07);
      ctx.beginPath();
      ctx.arc(c + Math.cos(angle) * radius, c + Math.sin(angle) * radius, blotch, 0, Math.PI * 2);
      ctx.fill();
    }

    const ring = ctx.createRadialGradient(c, c, size * 0.16, c, c, size * 0.34);
    ring.addColorStop(0, 'rgba(0, 242, 255, 0)');
    ring.addColorStop(0.5, 'rgba(0, 242, 255, 0.55)');
    ring.addColorStop(1, 'rgba(0, 242, 255, 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = ring;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';

    holeTexture = new THREE.CanvasTexture(canvas);
  }
  return holeTexture;
}

function getBulletHoleGeometry(): THREE.PlaneGeometry {
  if (!sharedGeometry) {
    sharedGeometry = new THREE.PlaneGeometry(1, 1);
  }
  return sharedGeometry;
}

interface BulletHole {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  active: boolean;
}

/** Pooled world-space bullet-hole decals for projectile hits on geometry. */
export class BulletHoleDecals {
  private readonly holes: BulletHole[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /**
   * Build one pooled decal ahead of time so the first wall hit doesn't pay
   * for canvas-texture creation, material compile, and GPU upload mid-fight.
   * Left visible (transparent, parked far below the map) so the shader
   * prewarm compile pass picks it up; hide with finishPrewarm().
   */
  prewarm(): void {
    if (this.holes.length > 0) return;
    const hole = this.acquire();
    hole.mesh.position.set(0, -10_000, 0);
    hole.mesh.visible = true;
    hole.material.opacity = 0;
    hole.active = false;
  }

  finishPrewarm(): void {
    for (const hole of this.holes) {
      if (!hole.active) hole.mesh.visible = false;
    }
  }

  spawn(point: THREE.Vector3, normal: THREE.Vector3): void {
    const hole = this.acquire();
    const mesh = hole.mesh;

    mesh.position.copy(point).addScaledVector(normal, SURFACE_OFFSET);
    _quat.setFromUnitVectors(_forward, normal);
    _rollQuat.setFromAxisAngle(normal, Math.random() * Math.PI * 2);
    mesh.quaternion.copy(_rollQuat).multiply(_quat);
    mesh.scale.setScalar(BASE_SIZE * (0.8 + Math.random() * 0.5));

    hole.age = 0;
    hole.active = true;
    hole.material.opacity = 1;
    mesh.visible = true;
  }

  update(delta: number): void {
    for (const hole of this.holes) {
      if (!hole.active) continue;

      hole.age += delta;
      if (hole.age >= BULLET_HOLE_TTL_SEC) {
        hole.active = false;
        hole.mesh.visible = false;
        continue;
      }

      const remaining = BULLET_HOLE_TTL_SEC - hole.age;
      hole.material.opacity = remaining < FADE_OUT_SEC ? remaining / FADE_OUT_SEC : 1;
    }
  }

  private acquire(): BulletHole {
    for (const hole of this.holes) {
      if (!hole.active) return hole;
    }

    if (this.holes.length < MAX_BULLET_HOLES) {
      const material = new THREE.MeshBasicMaterial({
        map: getBulletHoleTexture(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(getBulletHoleGeometry(), material);
      mesh.renderOrder = 12;
      mesh.matrixAutoUpdate = true;
      this.scene.add(mesh);
      const hole: BulletHole = { mesh, material, age: 0, active: false };
      this.holes.push(hole);
      return hole;
    }

    // Pool exhausted — recycle the oldest live hole.
    let oldest = this.holes[0]!;
    for (const hole of this.holes) {
      if (hole.age > oldest.age) oldest = hole;
    }
    return oldest;
  }

  dispose(): void {
    for (const hole of this.holes) {
      hole.mesh.removeFromParent();
      hole.material.dispose();
    }
    this.holes.length = 0;
  }
}
