const STORAGE_KEY = 'mouse-sensitivity';

export const MOUSE_SENSITIVITY_MIN = 0.2;
export const MOUSE_SENSITIVITY_MAX = 3;
export const MOUSE_SENSITIVITY_DEFAULT = 1;

export function clampMouseSensitivity(value: number): number {
  if (!Number.isFinite(value)) return MOUSE_SENSITIVITY_DEFAULT;
  return Math.max(MOUSE_SENSITIVITY_MIN, Math.min(MOUSE_SENSITIVITY_MAX, value));
}

export function getStoredMouseSensitivity(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return MOUSE_SENSITIVITY_DEFAULT;
  return clampMouseSensitivity(Number(raw));
}

export function storeMouseSensitivity(value: number): number {
  const clamped = clampMouseSensitivity(value);
  localStorage.setItem(STORAGE_KEY, String(clamped));
  return clamped;
}

/** Slider works in percent (20–300) so the range input stays integer-based. */
export function mouseSensitivityPercent(value: number): number {
  return Math.round(clampMouseSensitivity(value) * 100);
}
