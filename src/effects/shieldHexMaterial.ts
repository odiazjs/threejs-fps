import * as THREE from 'three';

const vertexShader = /* glsl */ `
  uniform float uBreak;
  uniform float uExpand;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vBreakPush;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p += dot(p, p.yzx + 19.19);
    return fract(p.x * p.y * p.z * (95.4337 + p.z));
  }

  void main() {
    vec3 n = normalize(normalMatrix * normal);
    float cell = hash31(normal * 3.7);
    float push = smoothstep(0.0, 1.0, uBreak - cell * 0.72) * (0.22 + cell * 0.35);
    vBreakPush = push;

    vec3 displaced = position + normal * (push + uExpand * 0.12);
    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uBreak;
  uniform float uAlpha;
  uniform float uIntensity;
  uniform vec3 uColor;
  uniform vec3 uColorBright;
  uniform vec3 uCameraPos;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vBreakPush;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p += dot(p, p.yzx + 19.19);
    return fract(p.x * p.y * p.z * (95.4337 + p.z));
  }

  vec2 hexCoords(vec2 p) {
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 h = vec2(dot(p, s * 0.5), dot(p, vec2(s.y, -s.x) * 0.5));
    return fract(h) - 0.5;
  }

  float hexGrid(vec3 n, float scale) {
    vec2 uvA = n.xy * scale;
    vec2 uvB = n.yz * scale;
    vec2 uvC = n.zx * scale;

    float dA = length(hexCoords(uvA));
    float dB = length(hexCoords(uvB));
    float dC = length(hexCoords(uvC));

    vec3 weights = abs(n);
    weights /= max(dot(weights, vec3(1.0)), 0.0001);

    return dA * weights.z + dB * weights.x + dC * weights.y;
  }

  void main() {
    vec3 n = normalize(vWorldNormal);
    float grid = hexGrid(n, 9.5);
    float line = 1.0 - smoothstep(0.0, 0.11, grid);
    float cellFill = smoothstep(0.34, 0.08, grid) * 0.22;

    float fresnel = pow(
      1.0 - max(dot(n, normalize(uCameraPos - vWorldPos)), 0.0),
      2.4
    );
    fresnel = mix(fresnel, 1.0, 0.28);

    float cell = hash31(n * 3.7);
    float dissolve = smoothstep(0.0, 1.0, uBreak - cell * 0.65);
    float shardFlash = smoothstep(0.02, 0.0, abs(uBreak - cell * 0.65 - 0.04)) * 2.5;

    float glow = (line * (1.8 + fresnel * 1.4) + cellFill + shardFlash) * uIntensity;
    vec3 col = mix(uColor, uColorBright, line * 0.85 + shardFlash * 0.4);
    col *= glow;

    float alpha = (line * 0.95 + cellFill * 0.65 + fresnel * 0.25) * uAlpha * uIntensity;
    alpha *= 1.0 - dissolve * 0.92;
    alpha += shardFlash * 0.35 * uAlpha;

    if (alpha < 0.02) discard;

    gl_FragColor = vec4(col, alpha);
  }
`;

export interface HexShieldUniforms {
  uTime: { value: number };
  uBreak: { value: number };
  uExpand: { value: number };
  uAlpha: { value: number };
  uIntensity: { value: number };
  uColor: { value: THREE.Color };
  uColorBright: { value: THREE.Color };
}

export interface HexShieldMaterialOptions {
  /** Multiplier for line glow and opacity — use >1 for large domes. */
  intensity?: number;
}

export function createHexShieldMaterial(
  options: HexShieldMaterialOptions = {},
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBreak: { value: 0 },
      uExpand: { value: 0 },
      uAlpha: { value: 1 },
      uIntensity: { value: options.intensity ?? 1 },
      uColor: { value: new THREE.Color(0x00c8ff) },
      uColorBright: { value: new THREE.Color(0x8afbff) },
      uCameraPos: { value: new THREE.Vector3() },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
