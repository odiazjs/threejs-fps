import * as THREE from 'three';

export interface PBRMeshOptions {
  color: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

export function createPBRMaterial(options: PBRMeshOptions): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: options.color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0.08,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

export function createPBRMesh(
  geometry: THREE.BufferGeometry,
  options: PBRMeshOptions,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, createPBRMaterial(options));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
