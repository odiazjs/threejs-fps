import * as THREE from 'three';

const ADDITIVE_BASIC = {
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
} as const;

let chipGeometry: THREE.BoxGeometry | null = null;
let worldSparkMaterial: THREE.PointsMaterial | null = null;
let playerSparkMaterial: THREE.PointsMaterial | null = null;
const chipMaterials = new Map<number, THREE.MeshBasicMaterial>();

export function getHitSplashChipGeometry(): THREE.BoxGeometry {
  if (!chipGeometry) {
    chipGeometry = new THREE.BoxGeometry(1, 1, 1);
  }
  return chipGeometry;
}

export function createHitSplashSparkMaterial(isPlayer: boolean, size: number): THREE.PointsMaterial {
  const template = isPlayer
    ? (playerSparkMaterial ??= new THREE.PointsMaterial({
        size,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        sizeAttenuation: true,
      }))
    : (worldSparkMaterial ??= new THREE.PointsMaterial({
        size,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        sizeAttenuation: true,
      }));
  const material = template.clone();
  material.size = size;
  return material;
}

export function createHitSplashChipMaterial(color: number): THREE.MeshBasicMaterial {
  let template = chipMaterials.get(color);
  if (!template) {
    template = new THREE.MeshBasicMaterial({
      color,
      opacity: 0.95,
      ...ADDITIVE_BASIC,
    });
    chipMaterials.set(color, template);
  }
  return template.clone();
}
