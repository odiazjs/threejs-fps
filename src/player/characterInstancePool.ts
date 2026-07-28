import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterTemplate } from './characterModel';
import { MatchPerfStats } from '../debug/MatchPerfStats';

const MAX_POOLED_PER_KEY = 3;

interface PooledRoot {
  readonly root: THREE.Group;
  readonly key: string;
}

const pool = new Map<string, THREE.Group[]>();

/**
 * Pool by mesh + skin only — pose clips live on the AnimationMixer, so walk?run
 * must not allocate a separate skinned root per locomotion FBX.
 */
export function characterPoolKey(meshFile: string, skinId: string): string {
  return `${skinId}::${meshFile}`;
}

/** Clone (or reuse) a skinned root for a character mesh/skin. */
export function acquireCharacterRoot(template: CharacterTemplate): THREE.Group {
  const key = characterPoolKey(template.meshFile, template.skinId);
  const list = pool.get(key);
  if (list && list.length > 0) {
    return list.pop()!;
  }
  MatchPerfStats.recordPoseClone();
  return cloneSkeleton(template.scene) as THREE.Group;
}

/** Return a skinned root to the pool after detaching runtime attachments. */
export function releaseCharacterRoot(
  meshFile: string,
  skinId: string,
  root: THREE.Object3D | null | undefined,
): void {
  if (!(root instanceof THREE.Group)) return;
  root.removeFromParent();

  // Drop transient children (weapons / debug) so the next checkout is clean.
  const sticky = new Set<THREE.Object3D>();
  root.traverse((child) => {
    if (child === root) return;
    // Keep skinned mesh / bone hierarchy; strip named runtime mounts.
    if (
      child.name === 'remoteHandRig'
      || child.name === 'lobbyHandRig'
      || child.name === 'hitCapsuleDebug'
    ) {
      sticky.add(child);
    }
  });
  for (const child of sticky) {
    child.removeFromParent();
  }

  const key = characterPoolKey(meshFile, skinId);
  let list = pool.get(key);
  if (!list) {
    list = [];
    pool.set(key, list);
  }
  if (list.length >= MAX_POOLED_PER_KEY) return;
  list.push(root);
}

/** Test / teardown helper. */
export function clearCharacterInstancePool(): void {
  pool.clear();
}

export type { PooledRoot };
