/** Formats and paints plasma mineral balance into all HUD slots. */
export function formatPlasmaMinerals(amount: number): string {
  return Math.max(0, Math.floor(amount)).toLocaleString('en-US');
}

/** Signed cost preview (e.g. upgrades spend, downgrades refund). */
export function formatPlasmaMineralCost(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return '0';
  const abs = Math.abs(rounded).toLocaleString('en-US');
  return rounded < 0 ? `+${abs}` : abs;
}

type PlasmaMineralsListener = (amount: number) => void;

const listeners = new Set<PlasmaMineralsListener>();

export function onPlasmaMineralsChange(listener: PlasmaMineralsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setPlasmaMineralsDisplay(amount: number): void {
  const text = formatPlasmaMinerals(amount);
  for (const el of document.querySelectorAll<HTMLElement>('[data-plasma-minerals]')) {
    el.textContent = text;
  }
  for (const listener of listeners) {
    listener(amount);
  }
}
