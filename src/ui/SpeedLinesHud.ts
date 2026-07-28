/**
 * Anime-style radial speed lines while sprinting / sliding.
 *
 * CSS/SVG only — no per-frame canvas redraws (those were causing ~20fps
 * hitches when compositing over the WebGL canvas during sprint).
 */

const LINE_COUNT = 42;
const FADE_IN_PER_SEC = 6;
const FADE_OUT_PER_SEC = 8;
const MAX_OPACITY = 0.34;
const SLIDE_OPACITY_SCALE = 1.12;

function buildSpeedLinesSvg(): string {
  const lines: string[] = [];
  const cx = 500;
  const cy = 500;
  const maxR = 720;

  for (let i = 0; i < LINE_COUNT; i++) {
    const angle = (i / LINE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
    const start = 0.38 + Math.random() * 0.2;
    const end = Math.min(0.98, start + 0.2 + Math.random() * 0.35);
    const x1 = cx + Math.cos(angle) * maxR * start;
    const y1 = cy + Math.sin(angle) * maxR * start;
    const x2 = cx + Math.cos(angle) * maxR * end;
    const y2 = cy + Math.sin(angle) * maxR * end;
    const width = 0.7 + Math.random() * 1.8;
    const alpha = 0.22 + Math.random() * 0.45;
    lines.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ` +
        `stroke="rgba(255,255,255,${alpha.toFixed(3)})" stroke-width="${width.toFixed(2)}" ` +
        `stroke-linecap="round"/>`,
    );
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">` +
    `<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%" stop-color="white" stop-opacity="0"/>` +
    `<stop offset="34%" stop-color="white" stop-opacity="0"/>` +
    `<stop offset="52%" stop-color="white" stop-opacity="1"/>` +
    `<stop offset="100%" stop-color="white" stop-opacity="1"/>` +
    `</radialGradient>` +
    `<mask id="m"><rect width="100%" height="100%" fill="url(#g)"/></mask></defs>` +
    `<g mask="url(#m)" fill="none">${lines.join('')}</g></svg>`;

  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export class SpeedLinesHud {
  private readonly root: HTMLDivElement;
  private readonly layer: HTMLDivElement;
  private opacity = 0;
  private targetOpacity = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'speed-lines-hud';
    this.root.setAttribute('aria-hidden', 'true');

    this.layer = document.createElement('div');
    this.layer.className = 'speed-lines-layer';
    this.layer.style.backgroundImage = buildSpeedLinesSvg();
    this.root.appendChild(this.layer);
    document.body.appendChild(this.root);
  }

  setActive(sprinting: boolean, sliding: boolean): void {
    if (sliding) {
      this.targetOpacity = MAX_OPACITY * SLIDE_OPACITY_SCALE;
    } else if (sprinting) {
      this.targetOpacity = MAX_OPACITY;
    } else {
      this.targetOpacity = 0;
    }
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) {
      this.opacity = 0;
      this.targetOpacity = 0;
      this.root.style.opacity = '0';
      this.root.classList.remove('is-racing');
    }
  }

  update(delta: number): void {
    const rate = this.targetOpacity > this.opacity ? FADE_IN_PER_SEC : FADE_OUT_PER_SEC;
    if (this.opacity < this.targetOpacity) {
      this.opacity = Math.min(this.targetOpacity, this.opacity + rate * delta);
    } else if (this.opacity > this.targetOpacity) {
      this.opacity = Math.max(this.targetOpacity, this.opacity - rate * delta);
    }

    if (this.opacity < 0.01) {
      this.opacity = 0;
      this.root.style.opacity = '0';
      this.root.classList.remove('is-racing');
      return;
    }

    this.root.style.opacity = String(this.opacity);
    this.root.classList.add('is-racing');
  }

  dispose(): void {
    this.root.remove();
  }
}
