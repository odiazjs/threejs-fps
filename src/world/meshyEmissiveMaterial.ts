import * as THREE from 'three';
import { configureColorTexture } from '../content/textureQuality';

function pickEmissiveTexture(material: THREE.Material): THREE.Texture | null {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
  ) {
    return material.emissiveMap ?? material.map ?? null;
  }
  if (
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial
  ) {
    return material.emissiveMap ?? material.map ?? null;
  }
  if (material instanceof THREE.MeshBasicMaterial) {
    return material.map ?? null;
  }
  return null;
}

/**
 * Convert GLB/PBR mats to Meshy-style self-lit Phong (cheaper on iGPU).
 * Black albedo, albedo on emissiveMap, emissiveIntensity 1.
 */
export function toMeshyEmissiveMaterial(
  source: THREE.Material,
  options: { solidEmissive?: number } = {},
): THREE.MeshPhongMaterial {
  const emissiveMap = pickEmissiveTexture(source);
  if (emissiveMap) {
    configureColorTexture(emissiveMap);
  }

  const solid = options.solidEmissive;
  const emissiveColor = emissiveMap != null ? 0xffffff : (solid ?? 0x000000);

  return new THREE.MeshPhongMaterial({
    color: 0x000000,
    specular: 0x000000,
    emissive: emissiveColor,
    emissiveIntensity: 1,
    emissiveMap,
    shininess: 0,
    transparent: source.transparent,
    opacity: source.opacity,
    side: source.side,
    depthWrite: source.depthWrite,
    depthTest: source.depthTest,
  });
}

/** Replace every mesh material under `root` with Meshy Phong. */
export function applyMeshyEmissiveMaterials(
  root: THREE.Object3D,
  options: {
    floorSolidColor?: number;
    isFloor?: (object: THREE.Object3D) => boolean;
  } = {},
): void {
  const isFloor =
    options.isFloor ??
    ((object: THREE.Object3D) => object.name.toLowerCase() === 'floor');

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const floor =
      isFloor(child) || isFloor(child.parent ?? child);
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const next = sources.map((source) => {
      let solid: number | undefined;
      if (
        floor &&
        source instanceof THREE.MeshStandardMaterial &&
        !source.map &&
        !source.emissiveMap
      ) {
        solid = source.color.getHex();
      } else if (floor && options.floorSolidColor !== undefined) {
        solid = options.floorSolidColor;
      }
      const converted = toMeshyEmissiveMaterial(source, {
        solidEmissive: solid,
      });
      source.dispose();
      return converted;
    });
    child.material = next.length === 1 ? next[0]! : next;
  });
}
