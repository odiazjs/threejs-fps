import * as THREE from 'three';
import { sampleGroundHeight } from '../../shared/level/terrainHeight.js';

interface BeamConfig {
  x: number;
  z: number;
  height: number;
  radius: number;
}

const BEAM_CONFIGS: BeamConfig[] = [
  { x: -24, z: 18, height: 46, radius: 1.35 },
  { x: 32, z: -22, height: 52, radius: 1.55 },
  { x: -8, z: -34, height: 44, radius: 1.2 },
];

const BEAM_VERTEX = /* glsl */ `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  varying vec3 vLocal;
  uniform float uHeight;
  uniform float uBaseRadius;
  uniform float uPulse;

  void main() {
    float radial = length(vLocal.xz) / uBaseRadius;
    float shell = 1.0 - smoothstep(0.12, 1.0, radial);
    shell = pow(max(shell, 0.0), 1.35);

    float yNorm = clamp(vLocal.y / uHeight, 0.0, 1.0);
    float rise = smoothstep(0.0, 0.05, yNorm);
    float fade = mix(1.0, 0.35, pow(yNorm, 1.45));
    float vertical = rise * fade;

    float core = pow(1.0 - smoothstep(0.0, 0.32, radial), 2.8);
    vec3 glow = vec3(0.28, 0.82, 1.0);
    vec3 coreColor = vec3(1.0);
    vec3 color = mix(glow, coreColor, core) * (0.9 + uPulse * 0.1);

    float alpha = shell * vertical * (0.42 + core * 0.48);
    gl_FragColor = vec4(color, alpha);
  }
`;

function createBeamMaterial(height: number, baseRadius: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHeight: { value: height },
      uBaseRadius: { value: baseRadius },
      uPulse: { value: 1.0 },
    },
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function createBeam(
  { x, z, height, radius }: BeamConfig,
  sampleHeight: (x: number, z: number) => number,
): THREE.Group {
  const root = new THREE.Group();
  const groundY = sampleHeight(x, z);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.28, radius, height, 28, 1, true),
    createBeamMaterial(height, radius),
  );
  column.position.y = height * 0.5;
  column.frustumCulled = false;
  root.add(column);

  const baseGlow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.35, 32),
    new THREE.MeshBasicMaterial({
      color: 0x66eeff,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  baseGlow.rotation.x = -Math.PI / 2;
  baseGlow.position.y = 0.03;
  root.add(baseGlow);

  const coreFlash = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.22, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  coreFlash.rotation.x = -Math.PI / 2;
  coreFlash.position.y = 0.04;
  root.add(coreFlash);

  root.position.set(x, groundY, z);
  root.userData.beamMaterial = column.material;
  return root;
}

export class LightBeams {
  readonly group = new THREE.Group();
  private readonly materials: THREE.ShaderMaterial[] = [];

  constructor(sampleHeight: (x: number, z: number) => number = sampleGroundHeight) {
    for (const config of BEAM_CONFIGS) {
      const beam = createBeam(config, sampleHeight);
      const material = beam.userData.beamMaterial as THREE.ShaderMaterial | undefined;
      if (material) this.materials.push(material);
      this.group.add(beam);
    }
  }

  update(time: number): void {
    const pulse = 0.92 + Math.sin(time * 0.75) * 0.08;
    for (const material of this.materials) {
      material.uniforms.uPulse.value = pulse;
    }
  }
}
