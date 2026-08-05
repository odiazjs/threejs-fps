import type {
  CreatePlasmaCheckoutResponse,
  PlasmaPurchaseStatusResponse,
} from '../../shared/api/payments';
import type { PlasmaMineralPackId } from '../../shared/content/plasmaMineralPacks';
import { API_BASE_URL } from '../config/apiUrl';
import { setPlasmaMineralsDisplay } from '../ui/plasmaMineralsHud';
import { ensureSession } from './playerSession';

interface ApiErrorBody {
  error?: string;
}

/** Server creates a Lemon Squeezy checkout; client only sends packId. */
export async function apiCreatePlasmaCheckout(
  packId: PlasmaMineralPackId,
): Promise<CreatePlasmaCheckoutResponse> {
  const session = await ensureSession();
  const response = await fetch(`${API_BASE_URL}/api/payments/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ packId }),
  });

  const data = (await response.json().catch(() => ({}))) as CreatePlasmaCheckoutResponse &
    ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Could not start checkout');
  }
  if (!data.checkoutUrl) {
    throw new Error('Checkout URL missing from server response');
  }
  return data;
}

/**
 * Read-only: has the signed Lemon webhook credited this pack yet?
 * Never grants minerals — that only happens in the webhook handler.
 */
export async function apiGetPlasmaPurchaseStatus(
  packId: PlasmaMineralPackId,
): Promise<PlasmaPurchaseStatusResponse> {
  const session = await ensureSession();
  const response = await fetch(
    `${API_BASE_URL}/api/payments/status?packId=${encodeURIComponent(packId)}`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    },
  );

  const data = (await response.json().catch(() => ({}))) as PlasmaPurchaseStatusResponse &
    ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Could not load purchase status');
  }
  setPlasmaMineralsDisplay(data.plasmaMinerals);
  return data;
}
