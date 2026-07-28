import type * as THREE from 'three';

/**
 * Registers teammate character roots for a dedicated OutlinePass (team color).
 * Separate from EnemyOutlineFx so red enemy silhouettes can render in the same frame.
 */
const selectedRoots = new Set<THREE.Object3D>();

export class TeammateOutlineFx {
  private attachedRoot: THREE.Object3D | null = null;

  get root(): THREE.Object3D | null {
    return this.attachedRoot;
  }

  attach(modelRoot: THREE.Object3D): void {
    if (this.attachedRoot === modelRoot) return;
    this.detach();
    this.attachedRoot = modelRoot;
    selectedRoots.add(modelRoot);
  }

  detach(): void {
    if (!this.attachedRoot) return;
    selectedRoots.delete(this.attachedRoot);
    this.attachedRoot = null;
  }

  static getSelectedRoots(): THREE.Object3D[] {
    return [...selectedRoots];
  }

  static hasSelections(): boolean {
    return selectedRoots.size > 0;
  }
}
