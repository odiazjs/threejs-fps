import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  BLOOM_RADIUS,
  BLOOM_STRENGTH,
  BLOOM_THRESHOLD,
  COLOR_GRADE_BRIGHTNESS,
  COLOR_GRADE_CONTRAST,
  COLOR_GRADE_SATURATION,
} from '../content/theme';

const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    brightness: { value: COLOR_GRADE_BRIGHTNESS },
    contrast: { value: COLOR_GRADE_CONTRAST },
    saturation: { value: COLOR_GRADE_SATURATION },
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
    uniform float brightness;
    uniform float contrast;
    uniform float saturation;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 color = tex.rgb + brightness;

      float lum = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(lum), color, 1.0 + saturation);

      color = (color - 0.5) * (1.0 + contrast) + 0.5;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), tex.a);
    }
  `,
};

export class PostProcessing {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly colorGradePass: ShaderPass;
  private readonly bindScene = new THREE.Scene();
  private readonly bindCamera = new THREE.PerspectiveCamera();

  constructor(renderer: THREE.WebGLRenderer) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(this.bindScene, this.bindCamera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    this.composer.addPass(this.bloomPass);

    this.colorGradePass = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.colorGradePass);

    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }
}
