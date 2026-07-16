import * as THREE from 'three';
import { EnemyOutlineFx } from '../effects/EnemyOutlineFx';
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
 * Park one character clone (plus the red enemy-outline overlay) far below the
 * map so the shader-compile prewarm pass builds the skinned lit programs and
 * the outline ShaderMaterial before the first opponent is ever rendered.
 * Without this, first sight of an enemy — usually the first firefight —
 * compiles those programs mid-combat and hitches.
 */
export async function buildCharacterShaderPrewarm(
  scene: THREE.Scene,
): Promise<CharacterShaderPrewarm | null> {
  let instance: CharacterInstance | null = null;
  const outline = new EnemyOutlineFx();

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
    instance = createCharacterInstance(template);
    instance.root.position.copy(PREWARM_POSITION);
    scene.add(instance.root);
    instance.root.updateMatrixWorld(true);
    outline.attach(instance.root);
  } catch (error) {
    console.warn('[prewarm] character shader prewarm failed', error);
    outline.detach();
    instance?.dispose();
    return null;
  }

  return {
    dispose(): void {
      // Hide, don't dispose: the outline ShaderMaterial and the skinned lit
      // character materials own the compiled programs. Disposing them here
      // would release those programs from three's cache and the first real
      // enemy render would compile them again mid-match. The parked clone
      // shares geometry with the cached template, so the extra memory is
      // negligible.
      if (instance) instance.root.visible = false;
    },
  };
}
