import * as THREE from 'three';
import { HARVEST_TEAM_VIVID_COLORS } from '../../shared/combat/teams';

const PANEL_WIDTH = 1.35;
const PANEL_HEIGHT = 2.05;
const PANEL_Y = 1.55;
/** Sink the projector pad onto the team-base platform surface. */
const PAD_Y = -0.2;
const PAD_RADIUS = 0.58;
const BEAM_COUNT = 6;

const _color = new THREE.Color();
const _camPos = new THREE.Vector3();
const _holoPos = new THREE.Vector3();

export interface HarvestInstallHologram {
  readonly object: THREE.Group;
  readonly teamId: number;
  update(elapsedSec: number, camera: THREE.Camera | null): void;
  dispose(): void;
}

/**
 * World-space "INSTALL HARVESTING BOX ù HERE" hologram at a team's install pad.
 * Team vivid color (blue / orange); billboards yaw toward the camera.
 */
export function createHarvestInstallHologram(
  teamId: number,
  x: number,
  y: number,
  z: number,
): HarvestInstallHologram {
  const hex =
    HARVEST_TEAM_VIVID_COLORS[teamId % HARVEST_TEAM_VIVID_COLORS.length] ??
    HARVEST_TEAM_VIVID_COLORS[0]!;
  _color.set(hex);
  const color = _color.clone();

  const root = new THREE.Group();
  root.name = `harvestInstallHologram_${teamId}`;
  root.position.set(x, y, z);

  const disposables: Array<{ dispose: () => void }> = [];

  // --- Ground pad (dark stone ring + glowing concentric rings) ---
  const padGeo = new THREE.CircleGeometry(PAD_RADIUS, 48);
  const padMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2e,
    roughness: 0.92,
    metalness: 0.15,
    transparent: true,
    opacity: 0.88,
    depthWrite: true,
  });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = PAD_Y;
  pad.receiveShadow = false;
  root.add(pad);
  disposables.push(padGeo, padMat);

  const ringGroup = new THREE.Group();
  ringGroup.position.y = PAD_Y + 0.012;
  root.add(ringGroup);

  const ringSpecs = [
    { inner: 0.1, outer: 0.16, opacity: 0.95 },
    { inner: 0.24, outer: 0.3, opacity: 0.75 },
    { inner: 0.38, outer: 0.44, opacity: 0.55 },
    { inner: 0.5, outer: 0.55, opacity: 0.35 },
  ];
  const ringMats: THREE.MeshBasicMaterial[] = [];
  for (const spec of ringSpecs) {
    const geo = new THREE.RingGeometry(spec.inner, spec.outer, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: spec.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    ringGroup.add(mesh);
    ringMats.push(mat);
    disposables.push(geo, mat);
  }

  // Segmented outer rim ticks
  const tickGeo = new THREE.PlaneGeometry(0.05, 0.1);
  const tickMat = new THREE.MeshBasicMaterial({
    color: color.clone(),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  disposables.push(tickGeo, tickMat);
  for (let i = 0; i < 12; i++) {
    const tick = new THREE.Mesh(tickGeo, tickMat);
    const a = (i / 12) * Math.PI * 2;
    tick.position.set(
      Math.cos(a) * (PAD_RADIUS - 0.02),
      PAD_Y + 0.015,
      Math.sin(a) * (PAD_RADIUS - 0.02),
    );
    tick.rotation.x = -Math.PI / 2;
    tick.rotation.z = -a;
    root.add(tick);
  }

  // --- Projection beams (ground ? panel) ---
  const beamGroup = new THREE.Group();
  root.add(beamGroup);
  const beamMats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < BEAM_COUNT; i++) {
    const geo = new THREE.PlaneGeometry(0.035, PANEL_Y * 0.72);
    const mat = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const beam = new THREE.Mesh(geo, mat);
    const a = (i / BEAM_COUNT) * Math.PI * 2;
    const r = 0.12 + (i % 2) * 0.08;
    beam.position.set(Math.cos(a) * r, PANEL_Y * 0.36 + PAD_Y * 0.5, Math.sin(a) * r);
    beamGroup.add(beam);
    beamMats.push(mat);
    disposables.push(geo, mat);
  }

  // --- Hologram panel (canvas texture + scanlines) ---
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  paintHologramPanel(ctx, canvas.width, canvas.height, hex);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  disposables.push(tex);

  const panelGeo = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
  // Normal blending so the dark canvas fill stays readable (additive washed it out).
  const panelMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: THREE.NormalBlending,
  });
  const panel = new THREE.Mesh(panelGeo, panelMat);
  panel.position.y = PANEL_Y;
  panel.renderOrder = 3;
  root.add(panel);
  disposables.push(panelGeo, panelMat);

  // Soft glow plate behind panel
  const glowGeo = new THREE.PlaneGeometry(PANEL_WIDTH * 1.12, PANEL_HEIGHT * 1.08);
  const glowMat = new THREE.MeshBasicMaterial({
    color: color.clone(),
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.y = PANEL_Y;
  glow.position.z = -0.02;
  glow.renderOrder = 2;
  root.add(glow);
  disposables.push(glowGeo, glowMat);

  let scanPhase = 0;

  return {
    object: root,
    teamId,
    update(elapsedSec: number, camera: THREE.Camera | null): void {
      // Billboard yaw toward camera
      if (camera) {
        camera.getWorldPosition(_camPos);
        root.getWorldPosition(_holoPos);
        const dx = _camPos.x - _holoPos.x;
        const dz = _camPos.z - _holoPos.z;
        if (dx * dx + dz * dz > 1e-6) {
          panel.rotation.y = Math.atan2(dx, dz);
          glow.rotation.y = panel.rotation.y;
          for (const beam of beamGroup.children) {
            beam.rotation.y = panel.rotation.y;
          }
        }
      }

      const bob = Math.sin(elapsedSec * 2.4) * 0.05;
      panel.position.y = PANEL_Y + bob;
      glow.position.y = PANEL_Y + bob;

      const pulse = 0.55 + Math.sin(elapsedSec * 3.6) * 0.2;
      for (let i = 0; i < ringMats.length; i++) {
        const base = ringSpecs[i]!.opacity;
        ringMats[i]!.opacity = base * (0.75 + pulse * 0.35);
      }
      glowMat.opacity = 0.05 + pulse * 0.06;
      panelMat.opacity = 1;
      for (const mat of beamMats) {
        mat.opacity = 0.1 + pulse * 0.14;
      }

      // Slow scanline shimmer via canvas redraw every few frames
      scanPhase += 0.016;
      if (scanPhase > 0.08) {
        scanPhase = 0;
        paintHologramPanel(
          ctx,
          canvas.width,
          canvas.height,
          hex,
          elapsedSec,
        );
        tex.needsUpdate = true;
      }
    },
    dispose(): void {
      root.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}

function paintHologramPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hex: string,
  elapsedSec = 0,
): void {
  ctx.clearRect(0, 0, w, h);

  // Near-opaque dark panel so team-colored text stays readable.
  roundPanelPath(ctx, 36, 28, w - 72, h - 56, 18);
  ctx.fillStyle = 'rgba(4, 6, 10, 0.92)';
  ctx.fill();
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  bg.addColorStop(0.45, hexToRgba(hex, 0.14));
  bg.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
  ctx.fillStyle = bg;
  ctx.fill();

  // Corner brackets
  ctx.strokeStyle = hexToRgba(hex, 0.9);
  ctx.lineWidth = 5;
  ctx.lineCap = 'square';
  drawBracket(ctx, 48, 40, 54, true, true);
  drawBracket(ctx, w - 48, 40, 54, false, true);
  drawBracket(ctx, 48, h - 40, 54, true, false);
  drawBracket(ctx, w - 48, h - 40, 54, false, false);

  // Scanlines (subtle over the dark plate)
  const scanOffset = Math.floor((elapsedSec * 40) % 6);
  ctx.fillStyle = hexToRgba(hex, 0.08);
  for (let y = 40 + scanOffset; y < h - 40; y += 6) {
    ctx.fillRect(44, y, w - 88, 2);
  }

  // Moving bright scan band
  const bandY = 60 + ((elapsedSec * 90) % (h - 140));
  const band = ctx.createLinearGradient(0, bandY - 18, 0, bandY + 18);
  band.addColorStop(0, hexToRgba(hex, 0));
  band.addColorStop(0.5, hexToRgba(hex, 0.12));
  band.addColorStop(1, hexToRgba(hex, 0));
  ctx.fillStyle = band;
  ctx.fillRect(44, bandY - 18, w - 88, 36);

  ctx.fillStyle = hex;
  ctx.strokeStyle = hex;
  ctx.shadowColor = hex;
  ctx.shadowBlur = 22;

  // Crown / shard icon
  drawCrownIcon(ctx, w * 0.5, 118, 52);

  // Text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 56px "Segoe UI", "Arial Black", sans-serif';
  ctx.fillText('INSTALL', w * 0.5, 228);
  ctx.font = '800 42px "Segoe UI", "Arial Black", sans-serif';
  ctx.fillText('HARVESTING BOX', w * 0.5, 286);

  ctx.font = '700 36px "Segoe UI", Arial, sans-serif';
  ctx.fillText('HERE', w * 0.5, 358);

  // Flanking rules around HERE
  ctx.shadowBlur = 14;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.18, 358);
  ctx.lineTo(w * 0.34, 358);
  ctx.moveTo(w * 0.66, 358);
  ctx.lineTo(w * 0.82, 358);
  ctx.stroke();

  // Down arrow
  drawDownArrow(ctx, w * 0.5, 530, 78);
  ctx.shadowBlur = 0;
}

function roundPanelPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r * 2);
  // Pointed bottom
  ctx.lineTo(x + w * 0.5, y + h);
  ctx.lineTo(x, y + h - r * 2);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBracket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  left: boolean,
  top: boolean,
): void {
  ctx.beginPath();
  const sx = left ? 1 : -1;
  const sy = top ? 1 : -1;
  ctx.moveTo(x, y + sy * len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + sx * len, y);
  ctx.stroke();
}

function drawCrownIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  // Three-pronged shard / crown matching the reference silhouette.
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size * 0.28, cy - size * 0.2);
  ctx.lineTo(cx + size * 0.85, cy - size * 0.55);
  ctx.lineTo(cx + size * 0.42, cy + size * 0.1);
  ctx.lineTo(cx + size * 0.62, cy + size * 0.85);
  ctx.lineTo(cx, cy + size * 0.28);
  ctx.lineTo(cx - size * 0.62, cy + size * 0.85);
  ctx.lineTo(cx - size * 0.42, cy + size * 0.1);
  ctx.lineTo(cx - size * 0.85, cy - size * 0.55);
  ctx.lineTo(cx - size * 0.28, cy - size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.stroke();
}

function drawDownArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.38, cy - size * 0.55);
  ctx.lineTo(cx + size * 0.38, cy - size * 0.55);
  ctx.lineTo(cx + size * 0.38, cy + size * 0.05);
  ctx.lineTo(cx + size * 0.72, cy + size * 0.05);
  ctx.lineTo(cx, cy + size * 0.75);
  ctx.lineTo(cx - size * 0.72, cy + size * 0.05);
  ctx.lineTo(cx - size * 0.38, cy + size * 0.05);
  ctx.closePath();
  ctx.fill();
}

function hexToRgba(hex: string, alpha: number): string {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`;
}
