import * as THREE from 'three';
import { FLOOR_SIZE } from '../../shared/level/kiloSectorColliders';
import { sampleGroundHeight } from '../../shared/level/terrainHeight';
import { GrassField, type GrassUpdateContext } from './GrassField';

const GROUND_SEGMENTS = 200;

function createGroundTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#48b440';
  ctx.fillRect(0, 0, size, size);

  const rand = (n: number) => {
    let s = n;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  };

  const r = rand(7);
  for (let i = 0; i < 6000; i++) {
    const x = r() * size;
    const y = r() * size;
    const g = 95 + r() * 45;
    const alpha = 0.1 + r() * 0.2;
    ctx.fillStyle = `rgba(${g - 5}, ${g + 35}, ${g - 15}, ${alpha})`;
    ctx.fillRect(x, y, 1 + r() * 2, 2 + r() * 3);
  }

  for (let i = 0; i < 80; i++) {
    const x = r() * size;
    const y = r() * size;
    const radius = 8 + r() * 28;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, 'rgba(90, 62, 40, 0.35)');
    grad.addColorStop(1, 'rgba(90, 62, 40, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGroundNormalTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n =
        Math.sin(x * 0.15) * Math.cos(y * 0.12) * 0.5 +
        Math.sin(x * 0.4 + y * 0.3) * 0.25;
      const v = Math.floor((0.5 + n * 0.12) * 255);
      const i = (y * size + x) * 4;
      imageData.data[i] = v;
      imageData.data[i + 1] = v;
      imageData.data[i + 2] = 255;
      imageData.data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  return texture;
}

export class TerrainBuilder {
  readonly grassField: GrassField;
  private readonly group = new THREE.Group();

  constructor() {
    this.grassField = new GrassField(sampleGroundHeight);

    const groundGeo = new THREE.PlaneGeometry(
      FLOOR_SIZE,
      FLOOR_SIZE,
      GROUND_SEGMENTS,
      GROUND_SEGMENTS,
    );
    groundGeo.rotateX(-Math.PI / 2);

    const positions = groundGeo.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      positions.setY(i, sampleGroundHeight(x, z));
    }
    groundGeo.computeVertexNormals();

    const ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshStandardMaterial({
        color: 0x48b440,
        map: createGroundTexture(),
        normalMap: createGroundNormalTexture(),
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    ground.receiveShadow = true;
    ground.castShadow = false;
    this.group.add(ground);
    this.group.add(this.grassField.mesh);
  }

  update(time: number, context?: GrassUpdateContext): void {
    this.grassField.update(time, context);
  }

  build(): THREE.Group {
    return this.group;
  }

  dispose(): void {
    this.grassField.dispose();
  }
}
