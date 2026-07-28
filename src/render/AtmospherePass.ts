import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Lightweight cinematic grade: soft vignette + mild contrast/warmth.
 * Used on Chrono-Bowl to sell dusk atmosphere without a heavy LUT stack.
 */
const AtmosphereShader = {
  name: 'AtmosphereShader',
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.38 },
    uContrast: { value: 1.06 },
    uSaturation: { value: 1.08 },
    uWarmth: { value: 0.04 },
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
    uniform float uVignette;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uWarmth;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 color = tex.rgb;

      // Contrast around mid-gray.
      color = (color - 0.5) * uContrast + 0.5;

      // Saturation.
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);

      // Warm dusk bias (lift reds, soft blue pull).
      color.r += uWarmth;
      color.b -= uWarmth * 0.55;

      // Soft vignette ù darker edges, clear center for HUD readability.
      vec2 d = vUv - 0.5;
      float r = length(d) * 1.41421356;
      float vig = smoothstep(0.35, 1.15, r);
      color *= 1.0 - vig * uVignette;

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), tex.a);
    }
  `,
};

export class AtmospherePass extends ShaderPass {
  constructor() {
    super(AtmosphereShader);
    this.enabled = false;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Chrono-Bowl ù barely-there grade (fog does the heavy lifting). */
  applyChronoBowl(): void {
    this.uniforms.uVignette.value = 0.06;
    this.uniforms.uContrast.value = 1.01;
    this.uniforms.uSaturation.value = 1.015;
    this.uniforms.uWarmth.value = 0.004;
    this.enabled = true;
  }

  /** Neutral / off. */
  applyDefault(): void {
    this.enabled = false;
  }
}
