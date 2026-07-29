import * as THREE from 'three';
import { HARVEST_TEAM_VIVID_COLORS } from '../../shared/combat/teams';

/** Box mesh height after normalize in harvestingBoxVisual. */
export const HARVESTING_BOX_HEIGHT = 0.55;
const ARROW_GAP = 0.18;
const ARROW_HEIGHT = 0.32;
const ARROW_RADIUS = 0.11;

const _color = new THREE.Color();

/**
 * Depth-tested glowing down-arrow above a harvesting box (occluded by world
 * meshes — not CSS2D).
 */
export function createHarvestingBoxTeamArrow(teamId: number): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(ARROW_RADIUS, ARROW_HEIGHT, 7);
  const hex =
    HARVEST_TEAM_VIVID_COLORS[teamId % HARVEST_TEAM_VIVID_COLORS.length] ??
    HARVEST_TEAM_VIVID_COLORS[0]!;
  _color.set(hex);
  const material = new THREE.MeshPhongMaterial({
    color: _color.clone(),
    emissive: _color.clone(),
    emissiveIntensity: 2.4,
    specular: 0x000000,
    shininess: 0,
    depthTest: true,
    depthWrite: true,
    transparent: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'harvestingBoxTeamArrow';
  // Cone defaults to +Y tip; flip so it points down at the crate.
  mesh.rotation.x = Math.PI;
  mesh.position.y = HARVESTING_BOX_HEIGHT + ARROW_GAP + ARROW_HEIGHT * 0.5;
  mesh.frustumCulled = true;
  mesh.renderOrder = 0;
  return mesh;
}

export function setHarvestingBoxArrowVisible(
  arrow: THREE.Object3D | null | undefined,
  visible: boolean,
): void {
  if (!arrow) return;
  arrow.visible = visible;
}

export function pulseHarvestingBoxArrow(
  arrow: THREE.Object3D | null | undefined,
  elapsedSec: number,
): void {
  if (!arrow || !arrow.visible) return;
  const bob = Math.sin(elapsedSec * 3.2) * 0.04;
  arrow.position.y =
    HARVESTING_BOX_HEIGHT + ARROW_GAP + ARROW_HEIGHT * 0.5 + bob;
  const mat = (arrow as THREE.Mesh).material;
  if (mat instanceof THREE.MeshPhongMaterial) {
    mat.emissiveIntensity = 2.15 + Math.sin(elapsedSec * 4.2) * 0.35;
  }
}
