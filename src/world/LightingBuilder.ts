import * as THREE from 'three';

export class LightingBuilder {
  build(): { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight } {
    const hemi = new THREE.HemisphereLight(0xb8e8ff, 0x3a4858, 0.62);

    const sun = new THREE.DirectionalLight(0xfff8ee, 1.35);
    sun.position.set(48, 56, 24);

    return { hemi, sun };
  }
}
