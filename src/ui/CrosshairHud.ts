const HIT_PULSE_SEC = 0.38;
const HIT_ATTACK_SEC = 0.045;
const HIT_HOLD_SEC = 0.12;
const HIT_SCALE_BOOST = 0.75;

export class CrosshairHud {
  private readonly root: HTMLElement;
  private readonly reticle: HTMLElement;
  private hitElapsed = 0;

  constructor() {
    this.root = document.getElementById('crosshair')!;
    this.reticle = this.root.querySelector('.crosshair-reticle')!;
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
    if (!visible) {
      this.resetHit();
    }
  }

  onHit(): void {
    this.hitElapsed = 0;
    this.root.classList.add('hit');
  }

  update(delta: number): void {
    if (!this.root.classList.contains('hit')) return;

    this.hitElapsed += delta;
    const scale = this.sampleHitScale(this.hitElapsed);
    this.reticle.style.transform = `rotate(45deg) scale(${scale})`;

    if (this.hitElapsed >= HIT_PULSE_SEC) {
      this.resetHit();
    }
  }

  private sampleHitScale(elapsed: number): number {
    if (elapsed < HIT_ATTACK_SEC) {
      const t = elapsed / HIT_ATTACK_SEC;
      return 1 + t * HIT_SCALE_BOOST;
    }

    if (elapsed < HIT_ATTACK_SEC + HIT_HOLD_SEC) {
      return 1 + HIT_SCALE_BOOST;
    }

    const decayStart = HIT_ATTACK_SEC + HIT_HOLD_SEC;
    const decayT = (elapsed - decayStart) / (HIT_PULSE_SEC - decayStart);
    return 1 + HIT_SCALE_BOOST * (1 - decayT);
  }

  private resetHit(): void {
    this.hitElapsed = 0;
    this.root.classList.remove('hit');
    this.reticle.style.transform = '';
  }
}
