import {
  DEFAULT_MAP_ID,
  isValidMapId,
  MAP_OPTIONS,
  type MapId,
} from '../../shared/level/maps';

const STORAGE_KEY = 'fps_selected_map_id';

export function getSelectedMapId(): MapId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isValidMapId(stored) ? stored : DEFAULT_MAP_ID;
  } catch {
    return DEFAULT_MAP_ID;
  }
}

export function setSelectedMapId(mapId: MapId): void {
  try {
    localStorage.setItem(STORAGE_KEY, mapId);
  } catch {
    // ignore storage failures
  }
}

export function initLobbyMapSelector(): void {
  const select = document.getElementById('lobby-map-select') as HTMLSelectElement | null;
  if (!select) return;

  select.replaceChildren();
  for (const option of MAP_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.id;
    el.textContent = `${option.label} — ${option.description}`;
    select.appendChild(el);
  }

  select.value = getSelectedMapId();
  select.addEventListener('change', () => {
    if (isValidMapId(select.value)) {
      setSelectedMapId(select.value);
    }
  });
}
