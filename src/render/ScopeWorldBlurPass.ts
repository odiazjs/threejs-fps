import { Vector2 } from 'three';
import type { WebGLRenderer, WebGLRenderTarget } from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const _size = new Vector2();

/** Subtle full-frame blur for sniper ADS (strength 0–1). */
const ScopeWorldBlurShader = {
  name: 'ScopeWorldBlurShader',
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
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
    uniform float uStrength;
    uniform vec2 uResolution;
    varying vec2 vUv;

    void main() {
      vec4 sharp = texture2D(tDiffuse, vUv);
      float s = clamp(uStrength, 0.0, 1.0);
      if (s < 0.001) {
        gl_FragColor = sharp;
        return;
      }

      // Small pixel radius — subtle soft focus, not a smear.
      vec2 texel = 1.0 / max(uResolution, vec2(1.0));
      float r = mix(0.69, 2.53, s);
      vec4 blur = sharp * 0.36;
      blur += texture2D(tDiffuse, vUv + vec2(-r,  0.0) * texel) * 0.16;
      blur += texture2D(tDiffuse, vUv + vec2( r,  0.0) * texel) * 0.16;
      blur += texture2D(tDiffuse, vUv + vec2( 0.0, -r) * texel) * 0.16;
      blur += texture2D(tDiffuse, vUv + vec2( 0.0,  r) * texel) * 0.16;

      gl_FragColor = mix(sharp, blur, s * 0.7475);
    }
  `,
};

export class ScopeWorldBlurPass extends ShaderPass {
  constructor() {
    super(ScopeWorldBlurShader);
    this.enabled = false;
  }

  setStrength(strength: number): void {
    const s = Math.max(0, Math.min(1, strength));
    this.uniforms.uStrength.value = s;
    this.enabled = s > 0.02;
  }

  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    renderer.getDrawingBufferSize(_size);
    this.uniforms.uResolution.value.copy(_size);
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}
