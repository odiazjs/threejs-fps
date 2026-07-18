import { DEFAULT_OPERATOR_CHARACTER_ID } from '../../shared/content/characters';

const STORAGE_KEY = 'fps_selected_operator_id';

let activeOperatorId = DEFAULT_OPERATOR_CHARACTER_ID;
let operatorReloadPending = false;
const listeners = new Set<() => void>();

function readStoredId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw.length > 0) return raw;
  } catch {
    // ignore
  }
  return DEFAULT_OPERATOR_CHARACTER_ID;
}

activeOperatorId = readStoredId();

export function getActiveOperatorId(): string {
  return activeOperatorId;
}

export function setActiveOperatorId(operatorId: string): void {
  if (!operatorId || activeOperatorId === operatorId) return;
  activeOperatorId = operatorId;
  operatorReloadPending = true;
  try {
    localStorage.setItem(STORAGE_KEY, operatorId);
  } catch {
    // ignore
  }
  for (const listener of listeners) listener();
}

/** True after Characters equip until lobby consumes it for a remount. */
export function consumeOperatorReload(): boolean {
  if (!operatorReloadPending) return false;
  operatorReloadPending = false;
  return true;
}

export function onActiveOperatorChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
