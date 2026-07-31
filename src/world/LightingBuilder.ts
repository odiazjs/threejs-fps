import * as THREE from 'three';
import {
  HARVEST_MAP_CEILING_Y,
  HARVEST_MAP_DEPTH,
  HARVEST_MAP_WIDTH,
  HARVEST_NEON_BLUE,
  HARVEST_NEON_ORANGE,
} from '../../shared/level/harvestMapConfig';

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
   * Chrono-Bowl — lobby peach / lavender palette, dimmer than outdoor
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

  /**
   * Harvest / showcase neon — 8 ceiling spotlights (4 orange + 4 blue),
   * pointing down on a 3×3 grid with the center skipped.
   * Each light has a matching emissive orb at the fixture.
   */
  buildShowcase(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'harvestNeonSpotLights';

    const halfX = HARVEST_MAP_WIDTH * 0.25;
    const halfZ = HARVEST_MAP_DEPTH * 0.25;
    const slots: Array<{ x: number; z: number; color: number; label: string }> = [
      { x: -halfX, z: -halfZ, color: HARVEST_NEON_ORANGE, label: 'orange' },
      { x: 0, z: -halfZ, color: HARVEST_NEON_BLUE, label: 'blue' },
      { x: halfX, z: -halfZ, color: HARVEST_NEON_ORANGE, label: 'orange' },
      { x: -halfX, z: 0, color: HARVEST_NEON_BLUE, label: 'blue' },
      { x: halfX, z: 0, color: HARVEST_NEON_BLUE, label: 'blue' },
      { x: -halfX, z: halfZ, color: HARVEST_NEON_ORANGE, label: 'orange' },
      { x: 0, z: halfZ, color: HARVEST_NEON_BLUE, label: 'blue' },
      { x: halfX, z: halfZ, color: HARVEST_NEON_ORANGE, label: 'orange' },
    ];

    const bulbGeo = new THREE.SphereGeometry(0.28, 20, 16);
    const haloGeo = new THREE.SphereGeometry(0.55, 16, 12);

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      const spot = new THREE.SpotLight(
        slot.color,
        320,
        55,
        Math.PI / 3.1,
        0.55,
        1.25,
      );
      spot.name = `harvest_neon_${slot.label}_${i + 1}`;
      spot.position.set(slot.x, HARVEST_MAP_CEILING_Y, slot.z);
      spot.target.position.set(slot.x, 0, slot.z);
      spot.castShadow = false;
      group.add(spot);
      group.add(spot.target);

      const bulb = new THREE.Mesh(
        bulbGeo,
        new THREE.MeshStandardMaterial({
          color: slot.color,
          emissive: slot.color,
          emissiveIntensity: 6,
          roughness: 0.2,
          metalness: 0,
          toneMapped: false,
        }),
      );
      bulb.name = `harvest_neon_bulb_${slot.label}_${i + 1}`;
      bulb.position.set(slot.x, HARVEST_MAP_CEILING_Y, slot.z);
      bulb.castShadow = false;
      bulb.receiveShadow = false;
      group.add(bulb);

      const halo = new THREE.Mesh(
        haloGeo,
        new THREE.MeshBasicMaterial({
          color: slot.color,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      halo.name = `harvest_neon_halo_${slot.label}_${i + 1}`;
      halo.position.copy(bulb.position);
      halo.castShadow = false;
      halo.receiveShadow = false;
      group.add(halo);
    }

    return group;
  }
}
