/**
 * Keeps lobby chrome panels from colliding by publishing measured heights
 * as CSS custom properties used by `.lobby-nav` top / bottom.
 * Also refreshes fluid UI scale on monitor / DPR changes (hot-plug).
 */
export function initLobbyChromeLayout(): () => void {
  const root = document.documentElement;
  const profile = document.querySelector('.lobby-profile') as HTMLElement | null;
  const friends = document.getElementById('friends-panel');
  const match = document.querySelector('.lobby-match-panel') as HTMLElement | null;
  const topRight = document.querySelector('.lobby-top-right') as HTMLElement | null;

  const syncUiScale = (): void => {
    // Mirror the CSS clamp so JS consumers / late paints stay aligned after
    // monitor hot-plug (visualViewport can update before layout settles).
    const vv = window.visualViewport;
    const cssW = vv?.width ?? window.innerWidth;
    const cssH = vv?.height ?? window.innerHeight;
    const vmin = Math.min(cssW, cssH);
    const base = 16;
    const minPx = 13;
    const maxPx = 20;
    const ref = 1080;
    const densityRaw = getComputedStyle(root)
      .getPropertyValue('--lobby-ui-density')
      .trim();
    const density = Number.parseFloat(densityRaw) || 1;
    const px = Math.min(maxPx, Math.max(minPx, (vmin / ref) * base)) * density;
    root.style.setProperty('--lobby-computed-root-px', `${px.toFixed(2)}px`);
  };

  const sync = (): void => {
    syncUiScale();

    // Mobile dock layout does not use the desktop nav band vars.
    if (window.matchMedia('(max-width: 900px)').matches) {
      root.style.removeProperty('--lobby-profile-end');
      root.style.removeProperty('--lobby-friends-end');
      root.style.removeProperty('--lobby-top-right-slot');
      return;
    }

    const inset =
      parseFloat(getComputedStyle(root).getPropertyValue('--lobby-inset')) || 20;

    if (profile) {
      const bottom = profile.getBoundingClientRect().bottom;
      root.style.setProperty(
        '--lobby-profile-end',
        `${Math.max(inset, Math.ceil(bottom))}px`,
      );
    }

    if (friends) {
      const top = friends.getBoundingClientRect().top;
      const fromBottom = Math.max(0, window.innerHeight - top);
      root.style.setProperty(
        '--lobby-friends-end',
        `${Math.max(inset, Math.ceil(fromBottom))}px`,
      );
    }

    if (topRight) {
      root.style.setProperty(
        '--lobby-top-right-slot',
        `${Math.ceil(topRight.getBoundingClientRect().width)}px`,
      );
    }

    if (match) {
      root.style.setProperty(
        '--lobby-match-height',
        `${Math.ceil(match.getBoundingClientRect().height)}px`,
      );
    }
  };

  const observed = [profile, friends, match, topRight].filter(
    (el): el is HTMLElement => Boolean(el),
  );
  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          sync();
        })
      : null;

  for (const el of observed) {
    ro?.observe(el);
  }

  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  // Rank / friends content can mount after first paint.
  requestAnimationFrame(sync);
  const latePass = window.setTimeout(sync, 250);

  return () => {
    window.clearTimeout(latePass);
    window.removeEventListener('resize', sync);
    window.visualViewport?.removeEventListener('resize', sync);
    window.visualViewport?.removeEventListener('scroll', sync);
    ro?.disconnect();
  };
}
