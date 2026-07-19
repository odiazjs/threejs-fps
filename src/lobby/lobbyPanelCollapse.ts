const MOBILE_QUERY = '(max-width: 900px)';

interface CollapsiblePanel {
  panel: HTMLElement;
  toggle: HTMLButtonElement;
  storageKey: string;
}

function setCollapsed(entry: CollapsiblePanel, collapsed: boolean): void {
  entry.panel.classList.toggle('is-collapsed', collapsed);
  entry.toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  const chevron = entry.toggle.querySelector('.lobby-panel-toggle-chevron');
  if (chevron) chevron.textContent = collapsed ? '▸' : '▾';
  try {
    localStorage.setItem(entry.storageKey, collapsed ? '1' : '0');
  } catch {
    // ignore
  }
}

function readCollapsed(storageKey: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === '0') return false;
    if (stored === '1') return true;
  } catch {
    // ignore
  }
  return fallback;
}

/** Mobile-only collapsible friends + map/mode panels so launch stays visible. */
export function initLobbyPanelCollapse(): void {
  const friendsPanel = document.getElementById('friends-panel');
  const friendsToggle = document.getElementById(
    'friends-panel-toggle',
  ) as HTMLButtonElement | null;
  const matchPanel = document.querySelector('.lobby-match-panel');
  const matchToggle = document.getElementById(
    'match-setup-toggle',
  ) as HTMLButtonElement | null;

  const panels: CollapsiblePanel[] = [];

  if (friendsPanel instanceof HTMLElement && friendsToggle) {
    panels.push({
      panel: friendsPanel,
      toggle: friendsToggle,
      storageKey: 'fps_lobby_friends_collapsed',
    });
  }
  if (matchPanel instanceof HTMLElement && matchToggle) {
    panels.push({
      panel: matchPanel,
      toggle: matchToggle,
      storageKey: 'fps_lobby_match_setup_collapsed',
    });
  }

  if (panels.length === 0) return;

  const mq = window.matchMedia(MOBILE_QUERY);

  for (const entry of panels) {
    setCollapsed(entry, readCollapsed(entry.storageKey, true));
    entry.toggle.addEventListener('click', () => {
      const nextCollapsed = !entry.panel.classList.contains('is-collapsed');
      setCollapsed(entry, nextCollapsed);
      // On mobile, keep only one panel expanded so LAUNCH stays on screen.
      if (!nextCollapsed && mq.matches) {
        for (const other of panels) {
          if (other !== entry) setCollapsed(other, true);
        }
      }
    });
  }
}
