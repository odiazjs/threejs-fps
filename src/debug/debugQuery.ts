const DEBUG_QUERY_KEYS = [
  'debugHitboxes',
  'axisDebug',
] as const;

export type DebugQueryKey = (typeof DEBUG_QUERY_KEYS)[number];

function isTruthyParam(value: string | null): boolean {
  return value !== 'false' && value !== '0';
}

/** Copy `?debug*` flags from the current URL into sessionStorage (lobby → iframe game). */
export function persistDebugFlagsFromUrl(search = window.location.search): void {
  const params = new URLSearchParams(search);
  for (const key of DEBUG_QUERY_KEYS) {
    if (!params.has(key)) continue;
    if (isTruthyParam(params.get(key))) {
      sessionStorage.setItem(key, '1');
    } else {
      sessionStorage.removeItem(key);
    }
  }
}

export function isDebugFlagEnabled(key: DebugQueryKey): boolean {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  if (params.has(key)) {
    return isTruthyParam(params.get(key));
  }

  return sessionStorage.getItem(key) === '1';
}

/** Preserve debug query params when opening game.html (iframe or full navigation). */
export function buildGameUrl(path = '/game.html'): string {
  persistDebugFlagsFromUrl();

  const url = new URL(path, window.location.origin);
  const current = new URLSearchParams(window.location.search);

  for (const key of DEBUG_QUERY_KEYS) {
    if (current.has(key)) {
      url.searchParams.set(key, current.get(key) ?? 'true');
      continue;
    }
    if (sessionStorage.getItem(key) === '1') {
      url.searchParams.set(key, 'true');
    }
  }

  return `${url.pathname}${url.search}`;
}

export function bootstrapDebugFlags(): void {
  persistDebugFlagsFromUrl();
}
