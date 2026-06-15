import * as THREE from 'three';

let gradientMap: THREE.CanvasTexture | null = null;

/** Discrete luminance steps — FlatKit-style 3-band cel shading. */
function getGradientMap(): THREE.CanvasTexture {
  if (gradientMap) return gradientMap;

  const bands = ['#555555', '#999999', '#dddddd'];
  const canvas = document.createElement('canvas');
  canvas.width = bands.length;
  canvas.height = 1;

  const ctx = canvas.getContext('2d')!;
  bands.forEach((hex, i) => {
    ctx.fillStyle = hex;
    ctx.fillRect(i, 0, 1, 1);
  });

  gradientMap = new THREE.CanvasTexture(canvas);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;

  return gradientMap;
}

export function createToonMaterial(
  color: THREE.ColorRepresentation,
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getGradientMap(),
    toneMapped: false,
  });
}
