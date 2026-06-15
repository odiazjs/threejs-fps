import * as THREE from 'three';

export class SceneBuilder {
  private scene: THREE.Scene | null = null;

  build(): this {
    this.scene = new THREE.Scene();
    return this;
  }

  addBackground(background: THREE.Color | THREE.Texture): this {
    this.requireScene().background = background;
    return this;
  }

  addFog(color: THREE.ColorRepresentation, near: number, far: number): this {
    this.requireScene().fog = new THREE.Fog(color, near, far);
    return this;
  }

  addLight(light: THREE.Light): this {
    this.requireScene().add(light);
    return this;
  }

  addObject(object: THREE.Object3D): this {
    this.requireScene().add(object);
    return this;
  }

  getScene(): THREE.Scene {
    return this.requireScene();
  }

  private requireScene(): THREE.Scene {
    if (!this.scene) {
      throw new Error('Call build() before configuring the scene.');
    }
    return this.scene;
  }
}
