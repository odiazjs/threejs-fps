import crypto from 'node:crypto';
import type { PlasmaMineralPackId } from '../../../shared/content/plasmaMineralPacks.js';
import { getLemonSqueezyConfig } from './config.js';

const LEMON_API_BASE = 'https://api.lemonsqueezy.com/v1';

export type CreateLemonCheckoutInput = {
  readonly packId: PlasmaMineralPackId;
  readonly variantId: string;
  readonly playerId: string;
  readonly email?: string | null;
  readonly name?: string | null;
};

export type LemonOrderWebhookPayload = {
  readonly meta?: {
    readonly event_name?: string;
    readonly custom_data?: Record<string, unknown>;
  };
  readonly data?: {
    readonly id?: string;
    readonly type?: string;
    readonly attributes?: {
      readonly status?: string;
      readonly first_order_item?: {
        readonly variant_id?: number | string;
      };
    };
  };
};

/** HMAC-SHA256 hex digest of the raw webhook body (Lemon Squeezy X-Signature). */
export function signLemonWebhookBody(rawBody: Buffer | string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyLemonWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const digest = Buffer.from(signLemonWebhookBody(rawBody, secret), 'utf8');
  const signature = Buffer.from(signatureHeader, 'utf8');
  if (digest.length !== signature.length) return false;
  return crypto.timingSafeEqual(digest, signature);
}

function buildCheckoutRedirectUrl(packId: PlasmaMineralPackId): string {
  const config = getLemonSqueezyConfig();
  try {
    const url = new URL(config.checkoutRedirectUrl);
    url.searchParams.set('plasmaPurchase', packId);
    return url.toString();
  } catch {
    const join = config.checkoutRedirectUrl.includes('?') ? '&' : '?';
    return `${config.checkoutRedirectUrl}${join}plasmaPurchase=${encodeURIComponent(packId)}`;
  }
}

export async function createLemonCheckout(
  input: CreateLemonCheckoutInput,
): Promise<{ checkoutUrl: string }> {
  const config = getLemonSqueezyConfig();

  const attributes: Record<string, unknown> = {
    checkout_data: {
      email: input.email ?? undefined,
      name: input.name ?? undefined,
      custom: {
        playerId: input.playerId,
        packId: input.packId,
      },
    },
    product_options: {
      redirect_url: buildCheckoutRedirectUrl(input.packId),
    },
  };

  const response = await fetch(`${LEMON_API_BASE}/checkouts`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes,
        relationships: {
          store: {
            data: { type: 'stores', id: String(config.storeId) },
          },
          variant: {
            data: { type: 'variants', id: String(input.variantId) },
          },
        },
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: { attributes?: { url?: string } };
    errors?: Array<{ detail?: string; title?: string }>;
  };

  if (!response.ok) {
    const err = payload.errors?.[0];
    const pointer =
      err && typeof err === 'object' && 'source' in err
        ? String((err as { source?: { pointer?: string } }).source?.pointer ?? '')
        : '';
    const detail =
      err?.detail ?? err?.title ?? `Lemon Squeezy checkout failed (${response.status})`;
    const where = pointer.includes('variant')
      ? ' (variant id not found for this API key/store — create products in Lemon and copy Variant ID)'
      : pointer.includes('store')
        ? ' (store id not found for this API key)'
        : pointer
          ? ` [${pointer}]`
          : '';
    throw new Error(`${detail}${where}`);
  }

  const checkoutUrl = payload.data?.attributes?.url?.trim();
  if (!checkoutUrl) {
    throw new Error('Lemon Squeezy checkout response missing url');
  }

  return { checkoutUrl };
}
