import * as THREE from 'three';

/** Neon red rim — matches the enemy nameplate glow. */
export const ENEMY_OUTLINE_COLOR = 0xff3b30;

const OUTLINE_VERTEX = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vViewNormal = normalize(normalMatrix * objectNormal);
    vViewPos = mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const OUTLINE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uPower;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  void main() {
    vec3 viewDir = normalize(-vViewPos);
    float facing = abs(dot(normalize(vViewNormal), viewDir));
    float fresnel = pow(1.0 - facing, uPower);
    // Additive: premultiply the rim strength into the color.
    gl_FragColor = vec4(uColor * fresnel * uIntensity, 1.0);
  }
`;

function createOutlineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(ENEMY_OUTLINE_COLOR) },
      uIntensity: { value: 1.6 },
      uPower: { value: 1.9 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

/**
 * Red fresnel rim glow over an enemy character model. Overlay meshes share
 * the source geometry (and skeleton, for skinned meshes) so they follow the
 * animated pose for free; only the shader material is owned here.
 */
export class EnemyOutlineFx {
  private overlays: THREE.Mesh[] = [];
  private material: THREE.ShaderMaterial | null = null;
  private attachedRoot: THREE.Object3D | null = null;

  get root(): THREE.Object3D | null {
    return this.attachedRoot;
  }

  attach(modelRoot: THREE.Object3D): void {
    if (this.attachedRoot === modelRoot) return;
    this.detach();

    this.material = createOutlineMaterial();
    const sources: THREE.Mesh[] = [];
    modelRoot.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) sources.push(child as THREE.Mesh);
    });

    for (const source of sources) {
      // Non-recursive clone keeps the skeleton/bind-matrix reference for
      // SkinnedMesh, so the overlay deforms with the same animated bones.
      const overlay = source.clone(false) as THREE.Mesh;
      overlay.material = this.material;
      overlay.castShadow = false;
      overlay.receiveShadow = false;
      // Skinned bounds lag the pose — never let the rim pop out mid-animation.
      overlay.frustumCulled = false;
      overlay.renderOrder = (source.renderOrder ?? 0) + 1;
      overlay.name = `${source.name}_enemyOutline`;
      source.add(overlay);
      // Counter the parent transform: the overlay must sit exactly on top.
      overlay.position.set(0, 0, 0);
      overlay.quaternion.identity();
      overlay.scale.set(1, 1, 1);
      this.overlays.push(overlay);
    }

    this.attachedRoot = modelRoot;
  }

  detach(): void {
    for (const overlay of this.overlays) {
      overlay.removeFromParent();
    }
    this.overlays.length = 0;
    this.material?.dispose();
    this.material = null;
    this.attachedRoot = null;
  }
}
