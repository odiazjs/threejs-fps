import * as THREE from 'three';
import {
  FLOATING_PLATFORMS,
  PLATFORM_DEFAULT_THICKNESS,
} from '../../shared/level/floatingPlatforms';
import { sampleGroundHeight } from '../../shared/level/terrainHeight';

const PARTICLES_PER_PLATFORM = 40;
const CYAN = new THREE.Color(0x2efcff);

const vertexShader = /* glsl */ `
attribute float aPhase;
attribute float aSpeed;
attribute float aStartY;
attribute float aEndY;

uniform float uTime;
uniform float uSize;

varying float vAlpha;

void main() {
  float t = fract(aPhase + uTime * aSpeed);
  float y = mix(aStartY, aEndY, t);
  vAlpha = 1.0 - abs(t - 0.5) * 1.6;

  vec4 mvPosition = modelViewMatrix * vec4(position.x, y, position.z, 1.0);
  gl_PointSize = uSize * (280.0 / max(-mvPosition.z, 1.0));
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;

  float core = pow(1.0 - d * 2.0, 2.2);
  gl_FragColor = vec4(uColor, core * vAlpha * 0.9);
}
`;

function createPlatformParticles(
  x: number,
  z: number,
  surfaceY: number,
  width: number,
  depth: number,
  thickness: number,
): THREE.Points {
  const startY = surfaceY - thickness;
  const endY = sampleGroundHeight(x, z) + 0.04;
  const count = PARTICLES_PER_PLATFORM;

  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const startYs = new Float32Array(count);
  const endYs = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * width * 0.72;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = (Math.random() - 0.5) * depth * 0.72;
    phases[i] = Math.random();
    speeds[i] = 0.28 + Math.random() * 0.38;
    startYs[i] = startY;
    endYs[i] = endY;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aStartY', new THREE.BufferAttribute(startYs, 1));
  geometry.setAttribute('aEndY', new THREE.BufferAttribute(endYs, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 5.5 },
      uColor: { value: CYAN },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.position.set(x, 0, z);
  return points;
}

export class PlatformLiftParticles {
  readonly group = new THREE.Group();
  private readonly materials: THREE.ShaderMaterial[] = [];

  constructor() {
    for (const platform of FLOATING_PLATFORMS) {
      const thickness = platform.thickness ?? PLATFORM_DEFAULT_THICKNESS;
      const points = createPlatformParticles(
        platform.x,
        platform.z,
        platform.surfaceY,
        platform.width,
        platform.depth,
        thickness,
      );
      this.materials.push(points.material as THREE.ShaderMaterial);
      this.group.add(points);
    }
  }

  update(time: number): void {
    for (const material of this.materials) {
      material.uniforms.uTime.value = time;
    }
  }

  dispose(): void {
    for (const child of this.group.children) {
      const points = child as THREE.Points;
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
    }
    this.group.clear();
    this.materials.length = 0;
  }
}
