import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLOOR_SIZE } from '../../shared/level/kiloSectorColliders';
import { MAP_PALETTE } from '../../shared/level/mapPalette';
import { shouldSkipGrass } from '../../shared/visuals/terrainPatches';

const BLADE_COUNT = 900_000;
const BLADE_WIDTH = 0.028;
const BLADE_HEIGHT = 0.24;
const GRID_STEP = 0.12;
const EXTRA_BLADE_CHANCE = 0.72;
const GLOBAL_HEIGHT_SCALE = 0.7225;
const PATCH_HEIGHT_SCALE = 0.5;

export interface GrassFieldOptions {
  halfExtent?: number;
  maxBlades?: number;
  gridStep?: number;
  bladeHeight?: number;
  bladeWidth?: number;
  bladeSegments?: number;
  extraBladeChance?: number;
  drawRadius?: number;
  skipPatches?: boolean;
  seed?: number;
  sunDirection?: THREE.Vector3;
  /** When set, only keep candidate points that return true (world XZ). */
  canPlace?: (x: number, z: number) => boolean;
  /** Fraction of blades that use {@link shortBladeScale} (0–1). */
  shortBladeChance?: number;
  /** Height multiplier for short blades (default 0.5). */
  shortBladeScale?: number;
}

export interface GrassUpdateContext {
  playerPos?: THREE.Vector3;
  cameraPos?: THREE.Vector3;
}

const vertexShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uBladeHeight;
uniform vec2 uPlayerPos;
uniform float uPlayerActive;
uniform float uPlayerRadius;
uniform vec3 uCameraPos;
uniform float uDrawRadius;
uniform vec3 uSunDir;

attribute float aPatchWeight;
attribute float aPatchVariant;

varying float vHeightT;
varying float vPatchWeight;
varying float vPatchVariant;
varying float vLighting;

void main() {
  vHeightT = clamp(position.y / uBladeHeight, 0.0, 1.0);
  vPatchWeight = aPatchWeight;
  vPatchVariant = aPatchVariant;

  vec4 worldPos = instanceMatrix * vec4(position, 1.0);

  vec3 toCam = worldPos.xyz - uCameraPos;
  float dist = length(toCam);
  if (dist > uDrawRadius) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vLighting = 0.0;
    return;
  }

  float bladeT = vHeightT;
  float phase = uTime * 0.7 + dot(worldPos.xz, vec2(0.3, 0.26));
  float sway = sin(phase) * (0.2 + sin(uTime * 0.2 + worldPos.x * 0.05) * 0.04);
  float tip = bladeT * bladeT * 0.032;
  worldPos.x += sway * tip;
  worldPos.z += cos(phase * 0.9) * sway * tip * 0.72;
  worldPos.y += sin(phase * 0.65) * bladeT * 0.003;

  vec2 toPlayer = worldPos.xz - uPlayerPos;
  float playerDist = length(toPlayer);
  float playerInfluence = uPlayerActive * (1.0 - smoothstep(uPlayerRadius * 0.15, uPlayerRadius, playerDist));
  playerInfluence *= bladeT * bladeT;
  if (playerDist > 0.001 && playerInfluence > 0.0) {
    worldPos.xz -= (toPlayer / playerDist) * playerInfluence * 0.5;
    worldPos.y -= playerInfluence * 0.04;
  }

  vec3 normal = normalize(vec3(0.0, 0.35, 0.0));
  vLighting = clamp(dot(normal, uSunDir) * 0.5 + 0.5, 0.72, 1.08);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fragmentShader = /* glsl */ `
precision mediump float;

uniform vec3 uColorShadow;
uniform vec3 uColorMid;
uniform vec3 uColorTip;
uniform vec3 uCyanShadow;
uniform vec3 uCyanMid;
uniform vec3 uCyanTip;
uniform vec3 uRoseShadow;
uniform vec3 uRoseMid;
uniform vec3 uRoseTip;

varying float vHeightT;
varying float vPatchWeight;
varying float vPatchVariant;
varying float vLighting;

vec3 shadeBlade(vec3 shadow, vec3 mid, vec3 tip, float t) {
  vec3 color = mix(shadow, mid, smoothstep(0.0, 0.45, t));
  return mix(color, tip, smoothstep(0.55, 1.0, t));
}

void main() {
  float t = vHeightT;
  vec3 green = shadeBlade(uColorShadow, uColorMid, uColorTip, t);
  vec3 cyan = shadeBlade(uCyanShadow, uCyanMid, uCyanTip, t);
  vec3 rose = shadeBlade(uRoseShadow, uRoseMid, uRoseTip, t);
  vec3 accent = mix(cyan, rose, vPatchVariant);
  vec3 color = mix(green, accent, vPatchWeight);
  color *= mix(0.5, 1.0, smoothstep(0.0, 0.18, t)) * vLighting;

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

function coloredPatchWeight(x: number, z: number): number {
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

/** Per patch cell: 0 = neon cyan, 1 = pastel rose. */
function coloredPatchVariant(x: number, z: number): number {
  const scale = 0.075;
  const cellX = Math.floor(x * scale);
  const cellZ = Math.floor(z * scale);
  return patchHash(cellX * 2.17 + 11, cellZ * 1.83 + 19) < 0.5 ? 0.0 : 1.0;
}

function createBladeGeometry(
  bladeWidth: number,
  bladeHeight: number,
  bladeSegments: number,
): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  const bladeCount = 3;
  const spread = (Math.PI * 2) / bladeCount;
  const heightSegments = Math.max(1, bladeSegments);

  for (let i = 0; i < bladeCount; i++) {
    const heightMul = 0.9 + (i % 2) * 0.12;
    const blade = new THREE.PlaneGeometry(
      bladeWidth,
      bladeHeight * heightMul,
      1,
      heightSegments,
    );
    const pos = blade.attributes.position;

    for (let j = 0; j < pos.count; j++) {
      const y = pos.getY(j);
      const h = bladeHeight * heightMul;
      const t = (y + h * 0.5) / h;
      const widthScale = 1.0 - t * t * 0.92;
      pos.setX(j, pos.getX(j) * widthScale);
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
    const bladeSegments = options.bladeSegments ?? 4;
    const drawRadius = options.drawRadius ?? 95;
    const geometry = createBladeGeometry(bladeWidth, bladeHeight, bladeSegments);
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
        uDrawRadius: { value: drawRadius },
        uPlayerPos: { value: this.playerPos },
        uPlayerActive: { value: 0 },
        uPlayerRadius: { value: 0.85 },
        uColorShadow: { value: new THREE.Color(MAP_PALETTE.grassDark) },
        uColorMid: { value: new THREE.Color(MAP_PALETTE.grassMid) },
        uColorTip: { value: new THREE.Color(MAP_PALETTE.grassLight) },
        uCyanShadow: { value: new THREE.Color(0x1a8f9c) },
        uCyanMid: { value: new THREE.Color(MAP_PALETTE.neonCyan) },
        uCyanTip: { value: new THREE.Color(0x9fffff) },
        uRoseShadow: { value: new THREE.Color(0xc88898) },
        uRoseMid: { value: new THREE.Color(MAP_PALETTE.pastelRose) },
        uRoseTip: { value: new THREE.Color(0xffd8e4) },
      },
      vertexShader,
      fragmentShader,
      side: THREE.FrontSide,
    });

    const patchWeights = new Float32Array(maxCount);
    const patchVariants = new Float32Array(maxCount);
    this.mesh = new THREE.InstancedMesh(geometry, this.material, maxCount);
    geometry.setAttribute(
      'aPatchWeight',
      new THREE.InstancedBufferAttribute(patchWeights, 1),
    );
    geometry.setAttribute(
      'aPatchVariant',
      new THREE.InstancedBufferAttribute(patchVariants, 1),
    );
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;

    const rand = seededRandom(options.seed ?? 42);
    const primary: Array<{ x: number; z: number }> = [];
    const extras: Array<{ x: number; z: number }> = [];
    const canPlace = options.canPlace;
    const shortBladeChance = Math.max(0, Math.min(1, options.shortBladeChance ?? 0));
    const shortBladeScale = Math.max(0.05, options.shortBladeScale ?? 0.5);

    const boostedExtraChance = Math.min(0.95, extraBladeChance + extraBladeChance * 0.3);
    const patchWeightAttr = geometry.getAttribute('aPatchWeight') as THREE.InstancedBufferAttribute;
    const patchVariantAttr = geometry.getAttribute('aPatchVariant') as THREE.InstancedBufferAttribute;

    const accept = (x: number, z: number): boolean => {
      if (skipPatches && shouldSkipGrass(x, z)) return false;
      if (canPlace && !canPlace(x, z)) return false;
      return true;
    };

    for (let gx = -half; gx < half; gx += gridStep) {
      for (let gz = -half; gz < half; gz += gridStep) {
        const jitter = gridStep * 0.92;
        const x = gx + (rand() - 0.5) * jitter;
        const z = gz + (rand() - 0.5) * jitter;
        if (!accept(x, z)) continue;
        primary.push({ x, z });

        if (boostedExtraChance > 0 && rand() < boostedExtraChance) {
          const x2 = x + (rand() - 0.5) * gridStep * 0.65;
          const z2 = z + (rand() - 0.5) * gridStep * 0.65;
          if (accept(x2, z2)) {
            extras.push({ x: x2, z: z2 });
          }
        }
        if (boostedExtraChance > 0 && rand() < boostedExtraChance * 0.5) {
          const x3 = x + (rand() - 0.5) * gridStep * 0.55;
          const z3 = z + (rand() - 0.5) * gridStep * 0.55;
          if (accept(x3, z3)) {
            extras.push({ x: x3, z: z3 });
          }
        }
        if (boostedExtraChance > 0 && rand() < boostedExtraChance * 0.28) {
          const x4 = x + (rand() - 0.5) * gridStep * 0.45;
          const z4 = z + (rand() - 0.5) * gridStep * 0.45;
          if (accept(x4, z4)) {
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
    let placeIndex = 0;

    const placeBlade = (x: number, z: number): void => {
      if (placeIndex >= maxCount) return;

      const patchWeight = coloredPatchWeight(x, z);
      const patchVariant = coloredPatchVariant(x, z);
      const widthScale = (0.72 + rand() * 0.42) * 1.08;
      const patchHeightMul = 1.0 - patchWeight * (1.0 - PATCH_HEIGHT_SCALE);
      const shortMul = shortBladeChance > 0 && rand() < shortBladeChance ? shortBladeScale : 1;
      const heightScale =
        (2.5 + rand() * 1.1) * GLOBAL_HEIGHT_SCALE * patchHeightMul * shortMul;

      const rotY = rand() * Math.PI * 2;
      const lean = (rand() - 0.5) * 0.2;

      dummy.position.set(x, sampleHeight(x, z) + 0.006 + rand() * 0.012, z);
      dummy.rotation.set(lean, rotY, (rand() - 0.5) * 0.1);
      dummy.scale.set(widthScale, heightScale, widthScale);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(placeIndex, dummy.matrix);
      patchWeightAttr.setX(placeIndex, patchWeight);
      patchVariantAttr.setX(placeIndex, patchVariant);
      placeIndex++;
    };

    if (primary.length <= maxCount) {
      for (const patch of primary) {
        placeBlade(patch.x, patch.z);
      }
    } else {
      const step = primary.length / maxCount;
      for (let i = 0; i < maxCount; i++) {
        const patch = primary[Math.floor(i * step)]!;
        placeBlade(patch.x, patch.z);
      }
    }

    const extraCount = Math.min(extras.length, maxCount - placeIndex);
    for (let i = 0; i < extraCount; i++) {
      const patch = extras[i]!;
      placeBlade(patch.x, patch.z);
    }

    this.mesh.count = placeIndex;
    this.mesh.instanceMatrix.needsUpdate = true;
    patchWeightAttr.needsUpdate = true;
    patchVariantAttr.needsUpdate = true;
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
