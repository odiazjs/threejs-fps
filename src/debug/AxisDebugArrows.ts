import * as THREE from 'three';

/** Flip to true to show local X/Y/Z arrows on any object using this helper. */
export const SHOW_AXIS_DEBUG_ARROWS = true;

export interface AxisDebugArrowsOptions {
  /** Arrow length in the parent object's local space. */
  length?: number;
  headLength?: number;
  headWidth?: number;
}

const AXIS_COLORS = {
  x: 0xff3333,
  y: 0xffdd00,
  z: 0x3388ff,
} as const;

/** +X red along local Z, +Y yellow along local Y, +Z blue along local X (Mixamo/weapon rigs). */
const AXIS_DIRECTIONS = [
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(1, 0, 0),
] as const;

const AXIS_SPEC = AXIS_DIRECTIONS.map((direction, index) => {
  const colors = [AXIS_COLORS.x, AXIS_COLORS.y, AXIS_COLORS.z] as const;
  return [direction, colors[index]!] as const;
});

export function isAxisDebugArrowsEnabled(): boolean {
  if (SHOW_AXIS_DEBUG_ARROWS) return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('axisDebug');
}

function disposeArrowHelper(arrow: THREE.ArrowHelper): void {
  arrow.line.geometry.dispose();
  (arrow.line.material as THREE.Material).dispose();
  arrow.cone.geometry.dispose();
  (arrow.cone.material as THREE.Material).dispose();
}

/**
 * Local-space axis arrows: +X red (+Z dir), +Y yellow, +Z blue (+X dir).
 *
 * Usage:
 * ```ts
 * const axes = attachAxisDebugArrowsIfEnabled(weaponMesh, { length: 0.4 });
 * // later: axes?.setVisible(false); axes?.dispose();
 * ```
 */
export class AxisDebugArrows {
  readonly object = new THREE.Group();
  private readonly arrows: THREE.ArrowHelper[] = [];

  constructor(options: AxisDebugArrowsOptions = {}) {
    this.object.name = 'axis-debug-arrows';
    this.object.renderOrder = 20;

    const length = options.length ?? 1;
    const headLength = options.headLength ?? length * 0.22;
    const headWidth = options.headWidth ?? length * 0.14;

    for (const [direction, color] of AXIS_SPEC) {
      const arrow = new THREE.ArrowHelper(
        direction,
        new THREE.Vector3(0, 0, 0),
        length,
        color,
        headLength,
        headWidth,
      );
      arrow.line.renderOrder = 20;
      arrow.cone.renderOrder = 20;
      (arrow.line.material as THREE.Material).depthTest = false;
      (arrow.cone.material as THREE.Material).depthTest = false;
      this.arrows.push(arrow);
      this.object.add(arrow);
    }
  }

  attach(parent: THREE.Object3D): void {
    parent.add(this.object);
  }

  detach(): void {
    this.object.removeFromParent();
  }

  setVisible(visible: boolean): void {
    this.object.visible = visible;
  }

  setLength(length: number): void {
    const headLength = length * 0.22;
    const headWidth = length * 0.14;
    for (let i = 0; i < this.arrows.length; i++) {
      const arrow = this.arrows[i]!;
      const color = (arrow.line.material as THREE.LineBasicMaterial).color.getHex();
      const direction = AXIS_DIRECTIONS[i]!;
      this.object.remove(arrow);
      disposeArrowHelper(arrow);

      const replacement = new THREE.ArrowHelper(
        direction,
        new THREE.Vector3(0, 0, 0),
        length,
        color,
        headLength,
        headWidth,
      );
      replacement.line.renderOrder = 20;
      replacement.cone.renderOrder = 20;
      (replacement.line.material as THREE.Material).depthTest = false;
      (replacement.cone.material as THREE.Material).depthTest = false;
      this.arrows[i] = replacement;
      this.object.add(replacement);
    }
  }

  dispose(): void {
    for (const arrow of this.arrows) {
      disposeArrowHelper(arrow);
    }
    this.arrows.length = 0;
    this.object.removeFromParent();
  }
}

/** Attaches axis arrows when debug is enabled; otherwise returns null. */
export function attachAxisDebugArrowsIfEnabled(
  parent: THREE.Object3D,
  options?: AxisDebugArrowsOptions,
): AxisDebugArrows | null {
  if (!isAxisDebugArrowsEnabled()) return null;

  const axes = new AxisDebugArrows(options);
  axes.attach(parent);
  return axes;
}
