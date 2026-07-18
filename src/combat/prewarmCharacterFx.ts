import * as THREE from 'three';
import {
  createCharacterInstance,
  loadGameCharacterTemplate,
  type CharacterInstance,
} from '../player/characterModel';

const PREWARM_POSITION = new THREE.Vector3(0, -10_000, 0);

export interface CharacterShaderPrewarm {
  dispose(): void;
}

/**
 * Park one character clone far below the map so the shader-compile prewarm
 * pass builds the skinned lit programs before the first opponent is rendered.
 * Enemy silhouette outlining is a post-process OutlinePass (no per-mesh
 * overlay material to prewarm here).
 */
export async function buildCharacterShaderPrewarm(
  scene: THREE.Scene,
): Promise<CharacterShaderPrewarm | null> {
  let instance: CharacterInstance | null = null;

  try {
    const template = await loadGameCharacterTemplate('plasma_rifle', {
      sprinting: false,
      walking: false,
      walkingBackward: false,
      jumping: false,
      crouching: false,
      reloading: false,
      switchingWeapon: false,
      meleeAttacking: false,
    });
    instance = createCharacterInstance(template, { applyFace: false });
    instance.root.position.copy(PREWARM_POSITION);
    scene.add(instance.root);
    instance.root.updateMatrixWorld(true);
  } catch (error) {
    console.warn('[prewarm] character shader prewarm failed', error);
    instance?.dispose();
    return null;
  }

  return {
    dispose(): void {
      // Hide, don't dispose: the skinned lit materials own the compiled
      // programs. Disposing them here would release those programs from
      // three's cache and the first real enemy render would compile them
      // again mid-match.
      if (instance) instance.root.visible = false;
    },
  };
}
