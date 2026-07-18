/** Shared store / lobby character pedestal idle clip. */
export const SHOWCASE_IDLE_FILE = 'character_showcase_idle.fbx';

/**
 * Characters with a mismatched bind pose vs the shared showcase idle need a
 * per-mesh Mixamo export. Convention: `character_foo.fbx` → `character_foo_idle.fbx`.
 */
const PER_MESH_IDLE_FILES: Readonly<Record<string, string>> = {
  'character_magma_fire.fbx': 'character_magma_fire_idle.fbx',
  'character_tech_nature.fbx': 'character_tech_nature_idle.fbx',
};

/** Prefer a per-mesh idle when authored; otherwise the shared showcase clip. */
export function showcaseIdleFileForMesh(meshFile: string): string {
  // Mesh exported with idle baked in (`*_idle.fbx`) — clip lives on the same file.
  if (/_idle\.fbx$/i.test(meshFile)) return meshFile;
  return PER_MESH_IDLE_FILES[meshFile] ?? SHOWCASE_IDLE_FILE;
}
