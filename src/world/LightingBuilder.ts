import * as THREE from 'three';

export class LightingBuilder {
  build(): { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight } {
    const hemi = new THREE.HemisphereLight(0xd8dde0, 0x383f46, 0.58);

    const sun = new THREE.DirectionalLight(0xf0f2f4, 1.25);
    sun.position.set(40, 48, 32);

    return { hemi, sun };
  }
}
