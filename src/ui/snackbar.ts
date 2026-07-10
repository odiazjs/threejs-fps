export type SnackbarTone = 'success' | 'error' | 'info';

export interface ShowSnackbarOptions {
  /** Visual tone. Defaults to `info`. */
  tone?: SnackbarTone;
  /** Auto-dismiss delay in ms. Defaults to 3800. */
  durationMs?: number;
}

const DEFAULT_DURATION_MS = 3800;
const MAX_VISIBLE = 5;
const EXIT_MS = 220;

let host: HTMLElement | null = null;
let seq = 0;

function ensureHost(): HTMLElement {
  if (host?.isConnected) return host;
  const existing = document.getElementById('app-snackbars');
  if (existing) {
    host = existing;
    return existing;
  }
  const el = document.createElement('div');
  el.id = 'app-snackbars';
  el.className = 'app-snackbars';
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-relevant', 'additions');
  document.body.appendChild(el);
  host = el;
  return el;
}

function dismissSnackbar(item: HTMLElement): void {
  if (item.dataset.dismissing === '1') return;
  item.dataset.dismissing = '1';
  item.classList.add('is-leaving');
  window.setTimeout(() => {
    item.remove();
  }, EXIT_MS);
}

/**
 * Show a stacked snackbar at top center (slides in from above).
 * Safe to call from any lobby/armory async resolution.
 */
export function showSnackbar(message: string, options: ShowSnackbarOptions = {}): void {
  const text = message.trim();
  if (!text) return;

  const root = ensureHost();
  const tone = options.tone ?? 'info';
  const durationMs = Math.max(1200, options.durationMs ?? DEFAULT_DURATION_MS);
  const id = `snackbar-${++seq}`;

  while (root.children.length >= MAX_VISIBLE) {
    const oldest = root.firstElementChild;
    if (oldest instanceof HTMLElement) dismissSnackbar(oldest);
    else break;
  }

  const item = document.createElement('div');
  item.id = id;
  item.className = `app-snackbar app-snackbar--${tone} hud-panel`;
  item.setAttribute('role', tone === 'error' ? 'alert' : 'status');

  const label = document.createElement('p');
  label.className = 'app-snackbar-text';
  label.textContent = text;
  item.appendChild(label);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'app-snackbar-close';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => dismissSnackbar(item));
  item.appendChild(closeBtn);

  root.appendChild(item);

  // Enter animation on next frame.
  requestAnimationFrame(() => {
    item.classList.add('is-visible');
  });

  window.setTimeout(() => {
    if (item.isConnected) dismissSnackbar(item);
  }, durationMs);
}

export function showSuccessSnackbar(message: string, durationMs?: number): void {
  showSnackbar(message, { tone: 'success', durationMs });
}

export function showErrorSnackbar(message: string, durationMs?: number): void {
  showSnackbar(message, { tone: 'error', durationMs });
}
