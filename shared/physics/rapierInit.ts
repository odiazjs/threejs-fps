import RAPIER from '@dimforge/rapier3d-compat';

let ready = false;
let initPromise: Promise<void> | null = null;

export async function initRapier(): Promise<void> {
  if (ready) return;
  if (!initPromise) {
    initPromise = RAPIER.init().then(() => {
      ready = true;
    });
  }
  await initPromise;
}

export function isRapierReady(): boolean {
  return ready;
}

export function assertRapierReady(): void {
  if (!ready) {
    throw new Error('[Rapier] Call initRapier() before using physics');
  }
}

export { RAPIER };
