import type * as THREE from 'three';

/** Neon red silhouette — matches the enemy nameplate glow. */
export const ENEMY_OUTLINE_COLOR = 0xff3b30;

const selectedRoots = new Set<THREE.Object3D>();

/**
 * Registers enemy character roots for the post-process silhouette OutlinePass.
 * The pass edge-detects a mask of selected objects, so only the outer player
 * contour is drawn — not every armor crease / crest.
 */
export class EnemyOutlineFx {
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

  /** Roots currently highlighted as enemies (for OutlinePass.selectedObjects). */
  static getSelectedRoots(): THREE.Object3D[] {
    return [...selectedRoots];
  }

  static hasSelections(): boolean {
    return selectedRoots.size > 0;
  }
}
