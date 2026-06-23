/** Left mouse button — primary fire. */
export const POINTER_SHOOT = 0;
/** Right mouse button — aim down sights. */
export const POINTER_ADS = 2;

export class PointerInput {
  private buttons: Record<number, boolean> = {};
  private justPressed = new Set<number>();

  constructor() {
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  isPressed(button: number): boolean {
    return this.buttons[button] === true;
  }

  isJustPressed(button: number): boolean {
    return this.justPressed.has(button);
  }

  endFrame(): void {
    this.justPressed.clear();
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.buttons[e.button]) {
      this.justPressed.add(e.button);
    }
    this.buttons[e.button] = true;
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.buttons[e.button] = false;
  };
}
