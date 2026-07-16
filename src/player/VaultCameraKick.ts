import * as THREE from 'three';
import { VAULT_ANIM_SEC } from '../../shared/combat/characterAnim';

/**
 * Authored first-person vault motion — quick dip toward the ledge, lift over,
 * then settle on the landing (1 s total).
 */
export class VaultCameraKick {
  private elapsed = 0;

  trigger(): void {
    this.elapsed = 0;
  }

  update(delta: number): void {
    if (this.elapsed >= VAULT_ANIM_SEC) return;
    this.elapsed = Math.min(VAULT_ANIM_SEC, this.elapsed + delta);
  }

  reset(): void {
    this.elapsed = 0;
  }

  isActive(): boolean {
    return this.elapsed > 0 && this.elapsed < VAULT_ANIM_SEC;
  }

  applyAdditive(
    yawRig: THREE.Object3D,
    pitchRig: THREE.Object3D,
    headRig: THREE.Object3D | null,
  ): void {
    if (!this.isActive()) return;

    const t = this.elapsed / VAULT_ANIM_SEC;
    const lift = Math.sin(t * Math.PI);
    const approach = Math.sin(Math.min(1, t * 1.35) * Math.PI * 0.5);

    pitchRig.rotation.x += approach * 0.34 - lift * 0.08;
    yawRig.rotation.z += Math.sin(t * Math.PI * 2) * 0.018;
    yawRig.rotation.y += Math.sin(t * Math.PI) * 0.025;

    if (headRig) {
      headRig.position.y += lift * 0.11;
      headRig.position.z += approach * -0.09 + lift * 0.05;
    }
  }
}
