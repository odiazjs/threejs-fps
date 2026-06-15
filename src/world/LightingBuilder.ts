import * as THREE from 'three';

export class LightingBuilder {
  build(): { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight } {
    const hemi = new THREE.HemisphereLight(0xd4ecec, 0x3a5048, 0.55);

    const sun = new THREE.DirectionalLight(0xfff5ee, 1.6);
    sun.position.set(12, 24, 8);

    return { hemi, sun };
  }
}
