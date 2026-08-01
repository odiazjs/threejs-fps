import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Blurs the frame outside a perfect circle (scope aperture); keeps the
 * interior sharp. Center/radius are in CSS pixel space (same as the HUD).
 */
const ScopeCircleBlurShader = {
  name: 'ScopeCircleBlurShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCenterPx: { value: new THREE.Vector2(0, 0) },
    uRadiusPx: { value: 200 },
    uBlurScale: { value: 5.5 },
    uEnabled: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform vec2 uCenterPx;
    uniform float uRadiusPx;
    uniform float uBlurScale;
    uniform float uEnabled;
    varying vec2 vUv;

    vec3 sampleBlur(vec2 uv, vec2 texel) {
      vec3 c = texture2D(tDiffuse, uv).rgb * 0.227027;
      c += texture2D(tDiffuse, uv + vec2(1.384615 * texel.x, 0.0)).rgb * 0.316216;
      c += texture2D(tDiffuse, uv - vec2(1.384615 * texel.x, 0.0)).rgb * 0.316216;
      c += texture2D(tDiffuse, uv + vec2(3.230769 * texel.x, 0.0)).rgb * 0.070270;
      c += texture2D(tDiffuse, uv - vec2(3.230769 * texel.x, 0.0)).rgb * 0.070270;

      vec3 v = texture2D(tDiffuse, uv).rgb * 0.227027;
      v += texture2D(tDiffuse, uv + vec2(0.0, 1.384615 * texel.y)).rgb * 0.316216;
      v += texture2D(tDiffuse, uv - vec2(0.0, 1.384615 * texel.y)).rgb * 0.316216;
      v += texture2D(tDiffuse, uv + vec2(0.0, 3.230769 * texel.y)).rgb * 0.070270;
      v += texture2D(tDiffuse, uv - vec2(0.0, 3.230769 * texel.y)).rgb * 0.070270;
      return (c + v) * 0.5;
    }

    void main() {
      vec4 sharpTex = texture2D(tDiffuse, vUv);
      if (uEnabled < 0.5) {
        gl_FragColor = sharpTex;
        return;
      }

      // CSS px: y grows downward; WebGL UV y grows upward.
      vec2 fragPx = vec2(vUv.x * uResolution.x, (1.0 - vUv.y) * uResolution.y);
      float dist = distance(fragPx, uCenterPx);
      // Soft rim: sharp inside the aperture, blurred outside.
      float blurMix = smoothstep(uRadiusPx * 0.96, uRadiusPx * 1.06, dist);

      vec2 texel = (uBlurScale / uResolution) * blurMix;
      vec3 blurred = sampleBlur(vUv, texel);
      vec3 color = mix(sharpTex.rgb, blurred, blurMix);
      gl_FragColor = vec4(color, sharpTex.a);
    }
  `,
};

export type ScopeCircleBlurParams = {
  readonly enabled: boolean;
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** Offset from viewport center in CSS px (same as crosshair aim offset). */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Aperture diameter in CSS px (optic cross size). */
  readonly diameterPx: number;
};

export class ScopeCircleBlurPass extends ShaderPass {
  constructor() {
    super(ScopeCircleBlurShader);
    this.enabled = false;
  }

  setScopeBlur(params: ScopeCircleBlurParams | null): void {
    if (!params?.enabled || !(params.viewWidth > 0) || !(params.viewHeight > 0)) {
      this.enabled = false;
      this.uniforms.uEnabled.value = 0;
      return;
    }

    this.enabled = true;
    this.uniforms.uEnabled.value = 1;
    this.uniforms.uResolution.value.set(params.viewWidth, params.viewHeight);
    this.uniforms.uCenterPx.value.set(
      params.viewWidth * 0.5 + params.offsetX,
      params.viewHeight * 0.5 + params.offsetY,
    );
    this.uniforms.uRadiusPx.value = Math.max(8, params.diameterPx * 0.5);
  }
}
