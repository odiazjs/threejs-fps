import type { UiSoundService } from './UiSoundService';

const INTERACTIVE_SELECTOR =
  'button, a[href], [role="button"], input[type="submit"], .lobby-menu-item, .weapons-picker-btn';

function isDisabledInteractive(el: Element): boolean {
  if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
    return el.disabled;
  }
  return false;
}

export function bindUiSounds(service: UiSoundService): void {
  let unlocked = false;
  let lastHoverEl: Element | null = null;

  const unlock = (): void => {
    if (unlocked) return;
    unlocked = true;
    service.unlock();
  };

  document.addEventListener(
    'pointerdown',
    () => {
      unlock();
    },
    { once: true },
  );

  document.addEventListener(
    'keydown',
    () => {
      unlock();
    },
    { once: true },
  );

  document.addEventListener('mouseover', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const el = target.closest(INTERACTIVE_SELECTOR);
    if (!el || el === lastHoverEl || isDisabledInteractive(el)) return;

    lastHoverEl = el;
    unlock();
    service.playHover();
  });

  document.addEventListener('mouseout', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const el = target.closest(INTERACTIVE_SELECTOR);
    if (el === lastHoverEl) {
      lastHoverEl = null;
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const el = target.closest(INTERACTIVE_SELECTOR);
    if (!el || isDisabledInteractive(el)) return;

    unlock();
    service.playClick();
  });
}
