import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

export interface EdgeLineOptions {
  thresholdAngle?: number;
  /** Width multiplier applied to the distance-based pixel width. */
  lineWidth?: number;
  color?: number;
}

const materials = new Set<LineMaterial>();
const edgeLines = new Set<LineSegments2>();

/** Width multiplier for edge lines (applied to the distance-based pixel width). */
export const DEFAULT_EDGE_LINE_WIDTH = 1.45;

/** Soft ink — deep slate (readable, not pure black). */
export const DEFAULT_EDGE_LINE_COLOR = 0x1e262c;

const CLOSE_RAMP_START = 0.25;
const CLOSE_RAMP_END = 2.8;

const TMP_POS = new THREE.Vector3();

/** Screen-space width in pixels — thin up close, readable mid-range, softer far away. */
function edgePixelWidth(dist: number): number {
  const nearRamp = THREE.MathUtils.smoothstep(CLOSE_RAMP_START, CLOSE_RAMP_END, dist);
  const nearThin = THREE.MathUtils.lerp(1.25, 1.85, nearRamp);
  const farFade = THREE.MathUtils.clamp(1.0 - Math.max(0, dist - 14) * 0.004, 0.65, 1.0);
  return nearThin * farFade;
}

function edgeOpacity(dist: number): number {
  const nearRamp = THREE.MathUtils.smoothstep(CLOSE_RAMP_START, CLOSE_RAMP_END, dist);
  const nearOpacity = THREE.MathUtils.lerp(0.72, 0.9, nearRamp);
  const farFade = THREE.MathUtils.clamp(1.0 - Math.max(0, dist - 18) * 0.0028, 0.55, 1.0);
  return Math.min(nearOpacity, farFade);
}

function safeResolution(): THREE.Vector2 {
  return new THREE.Vector2(
    Math.max(1, window.innerWidth || 1),
    Math.max(1, window.innerHeight || 1),
  );
}

function createLineMaterial(lineWidth: number, color: number): LineMaterial {
  const material = new LineMaterial({
    color,
    linewidth: lineWidth,
    worldUnits: false,
    alphaToCoverage: true,
    transparent: true,
    opacity: 1.0,
    depthTest: true,
    depthWrite: false,
  });
  material.resolution.copy(safeResolution());
  materials.add(material);
  return material;
}

function hasValidPositions(geometry: THREE.BufferGeometry): boolean {
  const position = geometry.attributes.position;
  if (!position || position.count === 0) return false;

  const array = position.array as ArrayLike<number>;
  for (let i = 0; i < array.length; i++) {
    const value = array[i]!;
    if (value !== value || !Number.isFinite(value)) return false;
  }

  return true;
}

function copyBoundsFromMesh(mesh: THREE.Mesh, lineGeometry: LineSegmentsGeometry): void {
  const source = mesh.geometry;
  if (!source.attributes.position || source.attributes.position.count === 0) return;

  source.computeBoundingSphere();
  if (source.boundingSphere && Number.isFinite(source.boundingSphere.radius)) {
    lineGeometry.boundingSphere = source.boundingSphere.clone();
  }

  source.computeBoundingBox();
  if (source.boundingBox) {
    lineGeometry.boundingBox = source.boundingBox.clone();
  }
}

function ensureValidBounds(mesh: THREE.Mesh, lineGeometry: LineSegmentsGeometry): void {
  lineGeometry.computeBoundingSphere();
  if (lineGeometry.boundingSphere && Number.isFinite(lineGeometry.boundingSphere.radius)) {
    return;
  }

  copyBoundsFromMesh(mesh, lineGeometry);

  if (!lineGeometry.boundingSphere || !Number.isFinite(lineGeometry.boundingSphere.radius)) {
    lineGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  }
}

export function updateLineResolution(width: number, height: number): void {
  const resolution = new THREE.Vector2(Math.max(1, width), Math.max(1, height));
  for (const material of materials) {
    material.resolution.copy(resolution);
  }
}

/** Thin and fade edges with distance so dense outlines do not blob into black. */
export function updateEdgeLinesForCamera(camera: THREE.Camera): void {
  const resolution = safeResolution();

  for (const material of materials) {
    material.resolution.copy(resolution);
  }

  const camPos = camera.position;
  if (!Number.isFinite(camPos.x) || !Number.isFinite(camPos.y) || !Number.isFinite(camPos.z)) {
    return;
  }

  for (const lines of edgeLines) {
    if (!lines.parent) continue;

    lines.getWorldPosition(TMP_POS);
    const dist = camPos.distanceTo(TMP_POS);
    if (!Number.isFinite(dist)) continue;

    const material = lines.material as LineMaterial;
    const widthMul =
      (lines.userData.edgeBaseWidth as number | undefined) ?? DEFAULT_EDGE_LINE_WIDTH;
    material.linewidth = edgePixelWidth(dist) * widthMul;
    material.opacity = edgeOpacity(dist);
  }
}

export function addEdgeLines(
  mesh: THREE.Mesh,
  {
    thresholdAngle = 15,
    lineWidth = DEFAULT_EDGE_LINE_WIDTH,
    color = DEFAULT_EDGE_LINE_COLOR,
  }: EdgeLineOptions = {},
): LineSegments2 | null {
  const sourceGeometry = mesh.geometry;
  if (!hasValidPositions(sourceGeometry)) {
    return null;
  }

  const edges = new THREE.EdgesGeometry(sourceGeometry, thresholdAngle);
  if (!hasValidPositions(edges)) {
    edges.dispose();
    return null;
  }

  const geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges);
  edges.dispose();

  if (!hasValidPositions(geometry)) {
    geometry.dispose();
    return null;
  }

  ensureValidBounds(mesh, geometry);

  const material = createLineMaterial(lineWidth, color);
  const lines = new LineSegments2(geometry, material);
  lines.renderOrder = 2;
  lines.frustumCulled = false;
  lines.userData.edgeBaseWidth = lineWidth;
  mesh.add(lines);
  edgeLines.add(lines);

  return lines;
}

export function createFlatKitMesh(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  edgeOptions?: EdgeLineOptions,
): THREE.Group {
  const group = new THREE.Group();
  const meshGeometry = geometry.clone();
  const mesh = new THREE.Mesh(meshGeometry, new THREE.MeshBasicMaterial({ color }));
  addEdgeLines(mesh, edgeOptions);
  group.add(mesh);
  return group;
}
