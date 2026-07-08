export class ThrowableHud {
  private readonly root: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly keyEl: HTMLElement;

  constructor() {
    this.root = document.getElementById('throwable-hud')!;
    this.countEl = document.getElementById('throwable-count')!;
    this.keyEl = this.root.querySelector('.throwable-key')!;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(count: number, equipped: boolean): void {
    this.countEl.textContent = String(count);
    this.root.classList.toggle('equipped', equipped);
    this.root.classList.toggle('empty', count <= 0);
    this.keyEl.textContent = 'G';
  }
}
