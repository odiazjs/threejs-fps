import * as THREE from 'three';

/** Soft warm key — same direction as lobby dawn lighting. */
const LOBBY_SUN_DIR = new THREE.Vector3(4.5, 2.2, 3.5);

export class LightingBuilder {
  build(): { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight } {
    // Bright AAA outdoor: vivid sky fill + strong warm key (soft shadows, not gray).
    const hemi = new THREE.HemisphereLight(0xb4e0ff, 0x4a5560, 0.72);

    const sun = new THREE.DirectionalLight(0xfff2dd, 1.55);
    sun.position.set(50, 60, 20);

    return { hemi, sun };
  }

  /**
   * Chrono-Bowl — lobby peach / lavender palette, dimmer than the showcase
   * so the FPS view doesn't wash out.
   */
  buildChronoBowl(): THREE.Light[] {
    const hemi = new THREE.HemisphereLight(0xd4c8e8, 0x6a5a58, 0.72);

    const key = new THREE.DirectionalLight(0xffe0b8, 0.85);
    key.position.copy(LOBBY_SUN_DIR);

    const fill = new THREE.DirectionalLight(0xc8b8e0, 0.28);
    fill.position.set(-3, 2.5, -2);

    const rim = new THREE.DirectionalLight(0xffd0a0, 0.2);
    rim.position.set(1.5, 1.2, -3);

    return [hemi, key, fill, rim];
  }
}
