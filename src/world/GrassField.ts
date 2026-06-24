import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_PALETTE } from '../../shared/level/mapPalette';
import { FLOOR_SIZE } from '../../shared/level/kiloSectorColliders';
import { shouldSkipGrass } from '../../shared/visuals/terrainPatches';

const BLADE_COUNT = 170_000;
const BLADE_WIDTH = 0.16;
const BLADE_HEIGHT = 0.13;
const GRID_STEP = 0.27;

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uBladeHeight;
varying vec2 vUv;
varying float vTip;

void main() {
  vUv = uv;
  vTip = position.y;

  vec3 pos = position;
  vec4 worldPos = instanceMatrix * vec4(pos, 1.0);

  float bladeT = clamp(pos.y / uBladeHeight, 0.0, 1.0);
  float windPhase = uTime * 1.35 + worldPos.x * 0.42 + worldPos.z * 0.36;
  float gustPhase = uTime * 0.55 + worldPos.x * 0.11 - worldPos.z * 0.14;

  float swayX = sin(windPhase) * 0.18 + sin(windPhase * 1.7 + 1.2) * 0.07;
  float swayZ = cos(windPhase * 0.9 + 0.8) * 0.12 + sin(gustPhase) * 0.05;
  swayX += sin(gustPhase * 2.4) * 0.04;
  swayZ += cos(gustPhase * 1.9) * 0.03;

  worldPos.x += swayX * bladeT * bladeT * uBladeHeight * 2.4;
  worldPos.z += swayZ * bladeT * bladeT * uBladeHeight * 2.4;
  worldPos.y += sin(windPhase * 0.8) * bladeT * 0.012;

  vec4 mvPosition = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColorBase;
uniform vec3 uColorMid;
uniform vec3 uColorTip;
uniform float uBladeHeight;

varying vec2 vUv;
varying float vTip;

void main() {
  float t = clamp(vTip / uBladeHeight, 0.0, 1.0);
  vec3 color = mix(uColorBase, uColorMid, smoothstep(0.0, 0.45, t));
  color = mix(color, uColorTip, smoothstep(0.45, 1.0, t));

  float shade = 0.9 + vUv.x * 0.14 + (1.0 - t) * 0.06;
  gl_FragColor = vec4(color * shade, 1.0);
}
`;

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function createTuftGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  const bladeCount = 5;
  const spread = (Math.PI * 2) / bladeCount;

  for (let i = 0; i < bladeCount; i++) {
    const blade = new THREE.PlaneGeometry(
      BLADE_WIDTH * (0.92 + (i % 2) * 0.08),
      BLADE_HEIGHT * (0.9 + (i % 3) * 0.05),
    );
    blade.rotateY(spread * i + (i % 2) * 0.12);
    blade.translate(0, BLADE_HEIGHT * 0.48, 0);
    blades.push(blade);
  }

  const inner = new THREE.PlaneGeometry(BLADE_WIDTH * 0.72, BLADE_HEIGHT * 0.88);
  inner.rotateY(Math.PI / 4);
  inner.translate(0, BLADE_HEIGHT * 0.44, 0);
  blades.push(inner);

  return mergeGeometries(blades)!;
}

export class GrassField {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(sampleHeight: (x: number, z: number) => number = () => 0) {
    const geometry = createTuftGeometry();

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBladeHeight: { value: BLADE_HEIGHT },
        uColorBase: { value: new THREE.Color(MAP_PALETTE.grassDark) },
        uColorMid: { value: new THREE.Color(MAP_PALETTE.grassMid) },
        uColorTip: { value: new THREE.Color(MAP_PALETTE.grassLight) },
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.InstancedMesh(geometry, this.material, BLADE_COUNT);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;

    const rand = seededRandom(42);
    const dummy = new THREE.Object3D();
    const half = FLOOR_SIZE / 2 - 1.0;
    let index = 0;

    for (let gx = -half; gx < half && index < BLADE_COUNT; gx += GRID_STEP) {
      for (let gz = -half; gz < half && index < BLADE_COUNT; gz += GRID_STEP) {
        const jitter = GRID_STEP * 0.78;
        const x = gx + (rand() - 0.5) * jitter;
        const z = gz + (rand() - 0.5) * jitter;
        if (shouldSkipGrass(x, z)) continue;

        const scale = 0.82 + rand() * 0.42;
        const rotY = rand() * Math.PI * 2;
        const heightScale = 0.86 + rand() * 0.22;

        dummy.position.set(x, sampleHeight(x, z) + 0.01 + rand() * 0.015, z);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(scale, scale * heightScale, scale);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }

    this.mesh.count = index;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
