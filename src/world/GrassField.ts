import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLOOR_SIZE } from '../../shared/level/kiloSectorColliders';
import { shouldSkipGrass } from '../../shared/visuals/terrainPatches';

const BLADE_COUNT = 900_000;
const BLADE_WIDTH = 0.028;
const BLADE_HEIGHT = 0.24;
const GRID_STEP = 0.12;
const EXTRA_BLADE_CHANCE = 0.72;
const GLOBAL_HEIGHT_SCALE = 0.7225;
const GOLD_HEIGHT_SCALE = 0.5;

export interface GrassFieldOptions {
  halfExtent?: number;
  maxBlades?: number;
  gridStep?: number;
  bladeHeight?: number;
  bladeWidth?: number;
  extraBladeChance?: number;
  skipPatches?: boolean;
  seed?: number;
  sunDirection?: THREE.Vector3;
}

export interface GrassUpdateContext {
  playerPos?: THREE.Vector3;
  cameraPos?: THREE.Vector3;
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uBladeHeight;
uniform vec2 uPlayerPos;
uniform float uPlayerActive;
uniform float uPlayerRadius;

varying vec2 vUv;
varying float vHeightT;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vUv = uv;
  vHeightT = clamp(position.y / uBladeHeight, 0.0, 1.0);

  vec3 pos = position;
  vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
  vWorldNormal = normalize(mat3(instanceMatrix) * normal);

  float bladeT = vHeightT;
  vec2 windDir = vec2(0.82, 0.38);
  float wave = sin(dot(worldPos.xz, windDir) * 0.26 - uTime * 0.62);
  float gust = sin(uTime * 0.22 + worldPos.x * 0.065 - worldPos.z * 0.052);
  float swayStrength = 0.22 + wave * 0.1 + gust * 0.05;
  float phase = uTime * 0.72 + worldPos.x * 0.32 + worldPos.z * 0.28;

  float swayX = sin(phase) * swayStrength + sin(phase * 1.5 + 1.0) * 0.06;
  float swayZ = cos(phase * 0.88 + 0.45) * swayStrength * 0.68 + sin(phase * 1.6) * 0.045;
  float tipSway = 0.034;
  float tallBoost = 1.0 + 0.18 * smoothstep(0.55, 1.0, bladeT);
  worldPos.x += swayX * bladeT * bladeT * tipSway * tallBoost;
  worldPos.z += swayZ * bladeT * bladeT * tipSway * tallBoost;
  worldPos.y += sin(phase * 0.68) * bladeT * 0.0035;

  vec2 toPlayer = worldPos.xz - uPlayerPos;
  float playerDist = length(toPlayer);
  float playerInfluence = uPlayerActive * (1.0 - smoothstep(uPlayerRadius * 0.1, uPlayerRadius, playerDist));
  playerInfluence *= bladeT * bladeT;
  if (playerDist > 0.001 && playerInfluence > 0.0) {
    vec2 pushDir = toPlayer / playerDist;
    worldPos.xz -= pushDir * playerInfluence * 0.55;
    worldPos.y -= playerInfluence * 0.05;
  }

  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
uniform vec3 uColorShadow;
uniform vec3 uColorMid;
uniform vec3 uColorHighlight;
uniform vec3 uColorTip;
uniform vec3 uColorRim;
uniform vec3 uGoldShadow;
uniform vec3 uGoldMid;
uniform vec3 uGoldHighlight;
uniform vec3 uGoldTip;
uniform vec3 uGoldRim;

varying vec2 vUv;
varying float vHeightT;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

float patchHash(vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}

float goldPatchWeight(vec2 worldXZ) {
  vec2 cell = floor(worldXZ * 0.075);
  float h = patchHash(cell);
  float h2 = patchHash(cell + vec2(17.0, 31.0));
  float pick = h * 0.62 + h2 * 0.38;

  vec2 local = fract(worldXZ * 0.075) - 0.5;
  float edge = 1.0 - smoothstep(0.18, 0.48, length(local));
  float soft = smoothstep(0.38, 0.62, pick) * edge;

  float ripple = sin(worldXZ.x * 0.11 + worldXZ.y * 0.085) * 0.5 + 0.5;
  return clamp(soft * 0.85 + ripple * 0.08, 0.0, 1.0);
}

vec3 shadeBlade(
  vec3 shadow,
  vec3 mid,
  vec3 highlight,
  vec3 tip,
  vec3 rim,
  vec3 viewDir,
  vec3 lightDir,
  vec3 normal
) {
  vec3 color = mix(shadow, mid, smoothstep(0.0, 0.38, vHeightT));
  color = mix(color, highlight, smoothstep(0.3, 0.82, vHeightT));
  color = mix(color, tip, smoothstep(0.7, 1.0, vHeightT));

  float NdotL = dot(normal, lightDir);
  color *= mix(0.72, 1.08, smoothstep(-0.15, 0.65, NdotL));

  float groundAo = mix(0.48, 1.0, smoothstep(0.0, 0.18, vHeightT));
  float depthAo = mix(0.88, 1.0, vUv.x);
  color *= groundAo * depthAo;

  float rimGlow = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.2);
  color += rim * rimGlow * 0.12 * smoothstep(0.55, 1.0, vHeightT);
  return color;
}

void main() {
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  vec3 lightDir = normalize(uSunDir);
  vec3 normal = normalize(vWorldNormal + vec3(0.0, 0.18, 0.0));

  vec3 greenColor = shadeBlade(
    uColorShadow, uColorMid, uColorHighlight, uColorTip, uColorRim,
    viewDir, lightDir, normal
  );
  vec3 goldColor = shadeBlade(
    uGoldShadow, uGoldMid, uGoldHighlight, uGoldTip, uGoldRim,
    viewDir, lightDir, normal
  );

  float goldWeight = goldPatchWeight(vWorldPos.xz);
  vec3 color = mix(greenColor, goldColor, goldWeight);

  gl_FragColor = vec4(color, 1.0);
}
`;

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function patchHash(cellX: number, cellZ: number): number {
  return fract(Math.sin(cellX * 127.1 + cellZ * 311.7) * 43758.5453);
}

function goldPatchWeight(x: number, z: number): number {
  const scale = 0.075;
  const cellX = Math.floor(x * scale);
  const cellZ = Math.floor(z * scale);
  const h = patchHash(cellX, cellZ);
  const h2 = patchHash(cellX + 17, cellZ + 31);
  const pick = h * 0.62 + h2 * 0.38;

  const fractX = fract(x * scale);
  const fractZ = fract(z * scale);
  const edge = 1.0 - smoothstep(0.18, 0.48, Math.hypot(fractX - 0.5, fractZ - 0.5));
  const soft = smoothstep(0.38, 0.62, pick) * edge;

  const ripple = Math.sin(x * 0.11 + z * 0.085) * 0.5 + 0.5;
  return Math.max(0, Math.min(1, soft * 0.85 + ripple * 0.08));
}

function heightMultiplier(x: number, z: number, rand: () => number): number {
  const goldWeight = goldPatchWeight(x, z);
  const goldHeightMul = 1.0 - goldWeight * (1.0 - GOLD_HEIGHT_SCALE);
  return (2.5 + rand() * 1.1) * GLOBAL_HEIGHT_SCALE * goldHeightMul;
}

function createBladeGeometry(
  bladeWidth: number,
  bladeHeight: number,
): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  const bladeCount = 3;
  const spread = (Math.PI * 2) / bladeCount;

  for (let i = 0; i < bladeCount; i++) {
    const heightMul = 0.9 + (i % 2) * 0.12;
    const blade = new THREE.PlaneGeometry(bladeWidth, bladeHeight * heightMul, 1, 6);
    const pos = blade.attributes.position;

    for (let j = 0; j < pos.count; j++) {
      const y = pos.getY(j);
      const h = bladeHeight * heightMul;
      const t = (y + h * 0.5) / h;
      const widthScale = 1.0 - Math.pow(t, 1.35) * 0.98;
      const curve = Math.sin(t * 1.2) * 0.015 * t;
      pos.setX(j, pos.getX(j) * widthScale + curve);
    }

    const yaw = spread * i + (i - 1) * 0.08;
    blade.rotateY(yaw);
    blade.translate(
      Math.sin(yaw) * bladeWidth * 0.15,
      bladeHeight * heightMul * 0.5,
      Math.cos(yaw) * bladeWidth * 0.15,
    );
    blades.push(blade);
  }

  return mergeGeometries(blades)!;
}

export class GrassField {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly playerPos = new THREE.Vector2();

  constructor(
    sampleHeight: (x: number, z: number) => number = () => 0,
    options: GrassFieldOptions = {},
  ) {
    const bladeHeight = options.bladeHeight ?? BLADE_HEIGHT;
    const bladeWidth = options.bladeWidth ?? BLADE_WIDTH;
    const extraBladeChance = options.extraBladeChance ?? EXTRA_BLADE_CHANCE;
    const geometry = createBladeGeometry(bladeWidth, bladeHeight);
    const half = options.halfExtent ?? FLOOR_SIZE / 2 - 1.0;
    const maxCount = options.maxBlades ?? BLADE_COUNT;
    const gridStep = options.gridStep ?? GRID_STEP;
    const skipPatches = options.skipPatches ?? true;
    const sunDir = (options.sunDirection ?? new THREE.Vector3(40, 48, 32)).clone().normalize();

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBladeHeight: { value: bladeHeight },
        uSunDir: { value: sunDir },
        uCameraPos: { value: new THREE.Vector3() },
        uPlayerPos: { value: this.playerPos },
        uPlayerActive: { value: 0 },
        uPlayerRadius: { value: 0.85 },
        uColorShadow: { value: new THREE.Color(0x1a5528) },
        uColorMid: { value: new THREE.Color(0x52d040) },
        uColorHighlight: { value: new THREE.Color(0x78e84e) },
        uColorTip: { value: new THREE.Color(0xa8f060) },
        uColorRim: { value: new THREE.Color(0xd0ff90) },
        uGoldShadow: { value: new THREE.Color(0x6a5520) },
        uGoldMid: { value: new THREE.Color(0xc8a830) },
        uGoldHighlight: { value: new THREE.Color(0xe8c848) },
        uGoldTip: { value: new THREE.Color(0xf5dc68) },
        uGoldRim: { value: new THREE.Color(0xfff0a0) },
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.InstancedMesh(geometry, this.material, maxCount);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;

    const rand = seededRandom(options.seed ?? 42);
    const primary: Array<{ x: number; z: number }> = [];
    const extras: Array<{ x: number; z: number }> = [];

    const boostedExtraChance = Math.min(0.95, extraBladeChance + 0.22);

    for (let gx = -half; gx < half; gx += gridStep) {
      for (let gz = -half; gz < half; gz += gridStep) {
        const jitter = gridStep * 0.92;
        const x = gx + (rand() - 0.5) * jitter;
        const z = gz + (rand() - 0.5) * jitter;
        if (skipPatches && shouldSkipGrass(x, z)) continue;
        primary.push({ x, z });

        if (boostedExtraChance > 0 && rand() < boostedExtraChance) {
          const x2 = x + (rand() - 0.5) * gridStep * 0.65;
          const z2 = z + (rand() - 0.5) * gridStep * 0.65;
          if (!skipPatches || !shouldSkipGrass(x2, z2)) {
            extras.push({ x: x2, z: z2 });
          }
        }
        if (boostedExtraChance > 0 && rand() < boostedExtraChance * 0.5) {
          const x3 = x + (rand() - 0.5) * gridStep * 0.55;
          const z3 = z + (rand() - 0.5) * gridStep * 0.55;
          if (!skipPatches || !shouldSkipGrass(x3, z3)) {
            extras.push({ x: x3, z: z3 });
          }
        }
        if (boostedExtraChance > 0 && rand() < boostedExtraChance * 0.28) {
          const x4 = x + (rand() - 0.5) * gridStep * 0.45;
          const z4 = z + (rand() - 0.5) * gridStep * 0.45;
          if (!skipPatches || !shouldSkipGrass(x4, z4)) {
            extras.push({ x: x4, z: z4 });
          }
        }
      }
    }

    for (let i = extras.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = extras[i];
      extras[i] = extras[j];
      extras[j] = tmp;
    }

    const dummy = new THREE.Object3D();
    const extraBudget = Math.max(0, maxCount - primary.length);
    const extraCount = Math.min(extras.length, extraBudget);
    const placeCount = primary.length + extraCount;

    const placeBlade = (x: number, z: number, index: number) => {
      const widthScale = (0.72 + rand() * 0.42) * 1.08;
      const heightScale = heightMultiplier(x, z, rand);

      const rotY = rand() * Math.PI * 2;
      const lean = (rand() - 0.5) * 0.2;

      dummy.position.set(x, sampleHeight(x, z) + 0.006 + rand() * 0.012, z);
      dummy.rotation.set(lean, rotY, (rand() - 0.5) * 0.1);
      dummy.scale.set(widthScale, heightScale, widthScale);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(index, dummy.matrix);
    };

    for (let i = 0; i < primary.length; i++) {
      placeBlade(primary[i]!.x, primary[i]!.z, i);
    }
    for (let i = 0; i < extraCount; i++) {
      placeBlade(extras[i]!.x, extras[i]!.z, primary.length + i);
    }

    this.mesh.count = placeCount;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(time: number, context: GrassUpdateContext = {}): void {
    this.material.uniforms.uTime.value = time;

    if (context.cameraPos) {
      this.material.uniforms.uCameraPos.value.copy(context.cameraPos);
    }

    if (context.playerPos) {
      this.playerPos.set(context.playerPos.x, context.playerPos.z);
      this.material.uniforms.uPlayerActive.value = 1;
    } else {
      this.material.uniforms.uPlayerActive.value = 0;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
