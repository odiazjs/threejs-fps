const DEFAULT_PREVENT_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'] as const;

export class KeyboardInput {
  private keys: Record<string, boolean> = {};
  private preventDefaultKeys: Set<string>;

  constructor(preventDefaultKeys: readonly string[] = DEFAULT_PREVENT_KEYS) {
    this.preventDefaultKeys = new Set(preventDefaultKeys);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
  }

  isPressed(code: string): boolean {
    return this.keys[code] === true;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys[e.code] = true;
    if (this.preventDefaultKeys.has(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };
}
