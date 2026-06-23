import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

export interface EdgeLineOptions {
  thresholdAngle?: number;
  lineWidth?: number;
}

let lineMaterial: LineMaterial | null = null;

function getLineMaterial(lineWidth: number): LineMaterial {
  if (!lineMaterial) {
    lineMaterial = new LineMaterial({
      color: 0x1a1a1a,
      linewidth: lineWidth,
      worldUnits: false,
      alphaToCoverage: true,
      depthTest: true,
      depthWrite: false,
    });
  }

  lineMaterial.linewidth = lineWidth;
  return lineMaterial;
}

export function updateLineResolution(width: number, height: number): void {
  if (lineMaterial) {
    lineMaterial.resolution.set(width, height);
  }
}

export function addEdgeLines(
  mesh: THREE.Mesh,
  { thresholdAngle = 1, lineWidth = 2 }: EdgeLineOptions = {},
): LineSegments2 {
  const edges = new THREE.EdgesGeometry(mesh.geometry, thresholdAngle);
  const geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges);
  edges.dispose();

  const material = getLineMaterial(lineWidth);
  const lines = new LineSegments2(geometry, material);
  lines.renderOrder = 2;
  mesh.add(lines);

  return lines;
}
