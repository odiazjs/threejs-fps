/**
 * Stackable top-right match alerts (Plasma Harvest objective warnings).
 * Persistent alerts stay on-screen while their text remains in the active set.
 */
export class MatchAlertHud {
  private readonly root: HTMLElement | null;
  private persistent: string[] = [];
  private visible = false;

  constructor() {
    this.root = document.getElementById('match-alert-hud');
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) {
      this.persistent = [];
    }
    this.render();
  }

  /**
   * Replace the active alert stack. Pass [] to clear.
   * Order is preserved (first = top).
   */
  setPersistent(texts: readonly string[]): void {
    const next = texts.filter((t) => t.length > 0);
    const same =
      next.length === this.persistent.length &&
      next.every((text, i) => text === this.persistent[i]);
    if (same) return;
    this.persistent = next;
    this.render();
  }

  update(_delta: number): void {
    // Persistent alerts; no expiry tick.
  }

  private render(): void {
    if (!this.root) return;
    this.root.replaceChildren();
    if (!this.visible || this.persistent.length === 0) {
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    for (const text of this.persistent) {
      const el = document.createElement('div');
      el.className = 'match-alert-toast';
      el.textContent = text;
      this.root.appendChild(el);
    }
  }
}
