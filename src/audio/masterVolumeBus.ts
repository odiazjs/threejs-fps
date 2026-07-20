import {
  clampMasterVolume,
  getStoredMasterVolume,
  storeMasterVolume,
} from '../settings/masterVolume';

type MasterVolumeListener = (volume: number) => void;

const listeners = new Set<MasterVolumeListener>();

/** Current persisted master volume (0–1). Safe for HTMLAudioElement play-time multiply. */
export function getMasterVolume(): number {
  return getStoredMasterVolume();
}

/** Persist and push to every subscribed audio service. */
export function applyMasterVolume(volume: number): number {
  const next = storeMasterVolume(volume);
  for (const listener of listeners) {
    listener(next);
  }
  return next;
}

/**
 * Subscribe a live audio graph. Invokes immediately with the stored value.
 * Returns an unsubscribe function.
 */
export function subscribeMasterVolume(listener: MasterVolumeListener): () => void {
  listeners.add(listener);
  listener(clampMasterVolume(getStoredMasterVolume()));
  return () => {
    listeners.delete(listener);
  };
}
