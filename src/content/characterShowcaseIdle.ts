import { SHARED_CHARACTER_MESH_FILE } from '../../shared/content/characterMesh';

/** Shared store / lobby character pedestal idle clip (embedded on the shared mesh). */
export const SHOWCASE_IDLE_FILE = SHARED_CHARACTER_MESH_FILE;

/**
 * Prefer a per-mesh idle when authored; otherwise the shared showcase clip.
 * `*_idle.fbx` meshes carry their own clip (including the shared Meshy body).
 */
export function showcaseIdleFileForMesh(meshFile: string): string {
  if (/_idle\.fbx$/i.test(meshFile)) return meshFile;
  return SHOWCASE_IDLE_FILE;
}
