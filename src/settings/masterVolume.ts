const STORAGE_KEY = 'master-volume';
const DEFAULT_MASTER_VOLUME = 1;

export function getDefaultMasterVolume(): number {
  return DEFAULT_MASTER_VOLUME;
}

export function clampMasterVolume(volume: number): number {
  if (!Number.isFinite(volume)) return getDefaultMasterVolume();
  return Math.max(0, Math.min(1, volume));
}

export function getStoredMasterVolume(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return getDefaultMasterVolume();
  return clampMasterVolume(Number(raw));
}

export function storeMasterVolume(volume: number): number {
  const clamped = clampMasterVolume(volume);
  localStorage.setItem(STORAGE_KEY, String(clamped));
  return clamped;
}

export function masterVolumePercent(volume: number): number {
  return Math.round(clampMasterVolume(volume) * 100);
}
