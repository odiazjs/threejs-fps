const ALERT_LIFETIME_SEC = 4;

/**
 * Top-right match alerts (Plasma Harvest objective warnings).
 * One alert at a time; auto-dismisses after {@link ALERT_LIFETIME_SEC}s.
 */
export class MatchAlertHud {
  private readonly root: HTMLElement | null;
  private text = '';
  private remaining = 0;
  private visible = false;

  constructor() {
    this.root = document.getElementById('match-alert-hud');
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) {
      this.text = '';
      this.remaining = 0;
    }
    this.render();
  }

  /**
   * Show a single alert (replaces any current one) for 4 seconds.
   * Empty / no-op when text is blank.
   */
  push(text: string): void {
    const next = text.trim();
    if (!next) return;
    this.text = next;
    this.remaining = ALERT_LIFETIME_SEC;
    this.render();
  }

  /**
   * @deprecated Prefer {@link push}. Kept so callers can clear via [].
   */
  setPersistent(texts: readonly string[]): void {
    if (texts.length === 0) {
      this.text = '';
      this.remaining = 0;
      this.render();
      return;
    }
    this.push(texts[0]!);
  }

  update(delta: number): void {
    if (!this.text || this.remaining <= 0) return;
    this.remaining -= delta;
    if (this.remaining <= 0) {
      this.text = '';
      this.remaining = 0;
      this.render();
    }
  }

  private render(): void {
    if (!this.root) return;
    this.root.replaceChildren();
    if (!this.visible || !this.text) {
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    const el = document.createElement('div');
    el.className = 'match-alert-toast';
    el.textContent = this.text;
    this.root.appendChild(el);
  }
}
