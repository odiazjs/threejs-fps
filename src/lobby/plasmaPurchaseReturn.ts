import type { AppShell } from '../app/AppShell';
import { apiGetPlasmaPurchaseStatus } from '../auth/paymentsApi';
import {
  isPlasmaMineralPackId,
  type PlasmaMineralPackId,
} from '../../shared/content/plasmaMineralPacks';
import { formatPlasmaMinerals } from '../ui/plasmaMineralsHud';
import { showErrorSnackbar } from '../ui/snackbar';
import { refreshLobbyProfileStats } from './lobbyProfileStats';

const QUERY_KEY = 'plasmaPurchase';
/** Wait for webhook → payment_transactions row (not an alternate credit path). */
const STATUS_ATTEMPTS = 20;
const STATUS_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clearPlasmaPurchaseQuery(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(QUERY_KEY)) return;
  url.searchParams.delete(QUERY_KEY);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', next);
}

function readPackIdFromQuery(): PlasmaMineralPackId | null {
  const raw = new URLSearchParams(window.location.search).get(QUERY_KEY);
  if (!raw || !isPlasmaMineralPackId(raw)) return null;
  return raw;
}

async function waitForWebhookCredit(packId: PlasmaMineralPackId) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < STATUS_ATTEMPTS; attempt++) {
    try {
      const status = await apiGetPlasmaPurchaseStatus(packId);
      if (status.credited && status.amountGranted != null) {
        return status;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Could not check purchase');
    }
    if (attempt < STATUS_ATTEMPTS - 1) {
      await sleep(STATUS_DELAY_MS);
    }
  }
  throw (
    lastError ??
    new Error(
      'Payment webhook has not credited your account yet. Confirm the Lemon webhook URL reaches this server.',
    )
  );
}

function openCongratsModal(
  amountGranted: number,
  onGoToStore: () => void,
  onContinue: () => void,
): void {
  const root = document.getElementById('plasma-purchase-congrats-modal');
  const amountEl = document.getElementById('plasma-purchase-congrats-amount');
  const storeBtn = document.getElementById('plasma-purchase-congrats-store');
  const continueBtn = document.getElementById('plasma-purchase-congrats-continue');
  if (!root || !amountEl || !storeBtn || !continueBtn) return;

  amountEl.textContent = formatPlasmaMinerals(amountGranted);

  const close = (): void => {
    root.hidden = true;
    storeBtn.removeEventListener('click', onStore);
    continueBtn.removeEventListener('click', onCont);
  };
  const onStore = (): void => {
    close();
    onGoToStore();
  };
  const onCont = (): void => {
    close();
    onContinue();
  };

  storeBtn.addEventListener('click', onStore);
  continueBtn.addEventListener('click', onCont);
  root.hidden = false;
}

/**
 * After Lemon redirect (`?plasmaPurchase=pack_1k`):
 * poll until the signed webhook has credited, then show congratulations.
 */
export async function maybeHandlePlasmaPurchaseReturn(
  appShell: AppShell,
): Promise<boolean> {
  const packId = readPackIdFromQuery();
  if (!packId) return false;

  clearPlasmaPurchaseQuery();

  try {
    const result = await waitForWebhookCredit(packId);
    await refreshLobbyProfileStats();
    openCongratsModal(
      result.amountGranted!,
      () => {
        void appShell.showView('store');
      },
      () => {
        /* stay on current view */
      },
    );
    return true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Purchase webhook has not credited minerals yet.';
    showErrorSnackbar(message);
    return true;
  }
}
