import type { Camera, Mesh, Object3D } from 'three';
import {
  addEdgeLines as addEdgeLinesShared,
  createFlatKitMesh as createFlatKitMeshShared,
  updateLineResolution as updateLineResolutionShared,
  updateEdgeLinesForCamera as updateEdgeLinesForCameraShared,
  DEFAULT_EDGE_LINE_WIDTH,
  type EdgeLineOptions,
} from '../../shared/visuals/edgeLines.js';
import { resolveGraphicsQuality } from '../render/graphicsQuality';

export { DEFAULT_EDGE_LINE_WIDTH, type EdgeLineOptions };

export function updateLineResolution(width: number, height: number): void {
  updateLineResolutionShared(width, height);
}

export function updateEdgeLinesForCamera(camera: Camera): void {
  if (!resolveGraphicsQuality().edgeLinesEnabled) return;
  updateEdgeLinesForCameraShared(camera);
}

export function addEdgeLines(
  mesh: Mesh,
  options?: EdgeLineOptions,
): ReturnType<typeof addEdgeLinesShared> {
  if (!resolveGraphicsQuality().edgeLinesEnabled) return null;
  return addEdgeLinesShared(mesh, options);
}

export function createFlatKitMesh(
  ...args: Parameters<typeof createFlatKitMeshShared>
): ReturnType<typeof createFlatKitMeshShared> {
  const group = createFlatKitMeshShared(...args);
  if (!resolveGraphicsQuality().edgeLinesEnabled) {
    group.traverse((child: Object3D) => {
      const anyChild = child as Object3D & { isLineSegments2?: boolean };
      if (anyChild.isLineSegments2) {
        anyChild.visible = false;
      }
    });
  }
  return group;
}
