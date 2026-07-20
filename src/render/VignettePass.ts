import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Stronger radial corner darkening — clear frame without crushing the center. */
const VignetteShader = {
  name: 'VignetteShader',
  uniforms: {
    tDiffuse: { value: null },
    /** Distance where darkening starts (0–0.7). */
    uInner: { value: 0.22 },
    /** Distance where darkening peaks (should be > uInner). */
    uOuter: { value: 0.72 },
    /** How hard corners go to black (0–1). */
    uStrength: { value: 0.78 },
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
    uniform float uInner;
    uniform float uOuter;
    uniform float uStrength;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      // Aspect-correct oval so left/right edges darken as much as top/bottom.
      vec2 q = vUv - 0.5;
      q.x *= 1.35;
      float dist = length(q);
      float vig = smoothstep(uInner, uOuter, dist);
      float shade = 1.0 - vig * uStrength;
      gl_FragColor = vec4(texel.rgb * shade, texel.a);
    }
  `,
};

export class VignettePass extends ShaderPass {
  constructor() {
    super(VignetteShader);
  }
}
