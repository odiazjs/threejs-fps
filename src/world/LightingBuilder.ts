import * as THREE from 'three';

export class LightingBuilder {
  build(): { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight } {
    // Bright AAA outdoor: vivid sky fill + strong warm key (soft shadows, not gray).
    const hemi = new THREE.HemisphereLight(0xb4e0ff, 0x4a5560, 0.72);

    const sun = new THREE.DirectionalLight(0xfff2dd, 1.55);
    sun.position.set(50, 60, 20);

    return { hemi, sun };
  }
}
