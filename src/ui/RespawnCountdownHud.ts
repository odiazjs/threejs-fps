/**
 * Centered "Respawning in X seconds..." prompt while waiting for Plasma Harvest
 * server respawn.
 */
export class RespawnCountdownHud {
  private readonly root: HTMLElement;
  private readonly valueEl: HTMLElement;
  private deathAtWorldTime = -1;
  private delaySec = 10;
  private lastShownSec = -1;

  constructor() {
    let root = document.getElementById('respawn-countdown-hud');
    if (!root) {
      root = document.createElement('div');
      root.id = 'respawn-countdown-hud';
      root.hidden = true;
      const text = document.createElement('p');
      text.className = 'respawn-countdown-text';
      text.innerHTML =
        'Respawning in <span class="respawn-countdown-value">10</span> seconds...';
      root.appendChild(text);
      document.body.appendChild(root);
    }
    this.root = root;
    this.valueEl = this.root.querySelector('.respawn-countdown-value')!;
  }

  /** Call when the local player transitions from alive ? dead. */
  begin(worldTime: number, delaySec: number): void {
    this.deathAtWorldTime = worldTime;
    this.delaySec = Math.max(1, delaySec);
    this.lastShownSec = -1;
    this.root.hidden = false;
    this.update(worldTime);
  }

  /** Call on respawn or when leaving the death state. */
  clear(): void {
    this.deathAtWorldTime = -1;
    this.lastShownSec = -1;
    this.root.hidden = true;
  }

  update(worldTime: number): void {
    if (this.deathAtWorldTime < 0) {
      this.root.hidden = true;
      return;
    }

    const remaining = Math.max(0, this.deathAtWorldTime + this.delaySec - worldTime);
    const whole = Math.max(1, Math.ceil(remaining));
    if (remaining <= 0) {
      // Keep showing "1" until the server marks us alive.
      if (this.lastShownSec !== 1) {
        this.lastShownSec = 1;
        this.valueEl.textContent = '1';
      }
      this.root.hidden = false;
      return;
    }

    if (whole !== this.lastShownSec) {
      this.lastShownSec = whole;
      this.valueEl.textContent = String(whole);
    }
    this.root.hidden = false;
  }
}
