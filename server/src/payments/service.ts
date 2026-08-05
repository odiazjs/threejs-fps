import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type {
  CreatePlasmaCheckoutResponse,
  PlasmaPurchaseStatusResponse,
} from '../../../shared/api/payments.js';
import {
  getPlasmaMineralPack,
  isPlasmaMineralPackId,
  type PlasmaMineralPackId,
} from '../../../shared/content/plasmaMineralPacks.js';
import type { AuthContext } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import { paymentTransactions } from '../db/schema/paymentTransactions.js';
import { users } from '../db/schema/users.js';
import { ensureUser, findUserById, getPlasmaMinerals } from '../db/users.js';
import {
  getLemonSqueezyConfig,
  getPackIdForVariant,
  getVariantIdForPack,
} from './config.js';
import {
  createLemonCheckout,
  type LemonOrderWebhookPayload,
  verifyLemonWebhookSignature,
} from './lemonSqueezy.js';

/** Only show congrats for webhook credits newer than this. */
const RECENT_CREDIT_WINDOW_MS = 30 * 60 * 1000;

export async function createPlasmaCheckout(
  auth: AuthContext,
  packIdRaw: string,
): Promise<CreatePlasmaCheckoutResponse> {
  await ensureUser(auth);

  if (!isPlasmaMineralPackId(packIdRaw)) {
    throw new Error('Invalid plasma mineral pack');
  }
  const packId: PlasmaMineralPackId = packIdRaw;
  const pack = getPlasmaMineralPack(packId);
  if (!pack) {
    throw new Error('Invalid plasma mineral pack');
  }

  const variantId = getVariantIdForPack(packId);
  const { checkoutUrl } = await createLemonCheckout({
    packId,
    variantId,
    playerId: auth.sub,
    email: auth.email,
    name: auth.displayName,
  });

  return { checkoutUrl, packId };
}

/**
 * Read-only status for the congrats UI. Does NOT call Lemon or credit wallet —
 * credits happen only in {@link handleLemonSqueezyWebhook}.
 */
export async function getPlasmaPurchaseStatus(
  auth: AuthContext,
  packIdRaw: string,
): Promise<PlasmaPurchaseStatusResponse> {
  await ensureUser(auth);

  if (!isPlasmaMineralPackId(packIdRaw)) {
    throw new Error('Invalid plasma mineral pack');
  }
  const packId: PlasmaMineralPackId = packIdRaw;
  const plasmaMinerals = await getPlasmaMinerals(auth.sub);
  const since = new Date(Date.now() - RECENT_CREDIT_WINDOW_MS);

  const [row] = await getDb()
    .select({
      amountGranted: paymentTransactions.amountGranted,
    })
    .from(paymentTransactions)
    .where(
      and(
        eq(paymentTransactions.userId, auth.sub),
        eq(paymentTransactions.packId, packId),
        eq(paymentTransactions.status, 'completed'),
        gte(paymentTransactions.createdAt, since),
      ),
    )
    .orderBy(desc(paymentTransactions.createdAt))
    .limit(1);

  if (!row) {
    return {
      credited: false,
      packId,
      amountGranted: null,
      plasmaMinerals,
    };
  }

  return {
    credited: true,
    packId,
    amountGranted: row.amountGranted,
    plasmaMinerals,
  };
}

type CreditOrderInput = {
  readonly orderId: string;
  readonly playerId: string;
  readonly packId: PlasmaMineralPackId;
  readonly lemonVariantId: string;
};

async function creditLemonOrder(
  input: CreditOrderInput,
): Promise<{ duplicate: boolean; amountGranted: number; plasmaMinerals: number }> {
  const pack = getPlasmaMineralPack(input.packId);
  if (!pack) {
    throw new Error('Pack catalog missing entry');
  }

  const user = await findUserById(input.playerId);
  if (!user) {
    throw new Error(`Unknown playerId: ${input.playerId}`);
  }

  const db = getDb();
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paymentTransactions)
      .values({
        id: randomUUID(),
        userId: input.playerId,
        packId: input.packId,
        amountGranted: pack.amount,
        lemonOrderId: input.orderId,
        lemonVariantId: input.lemonVariantId,
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: paymentTransactions.lemonOrderId })
      .returning({ id: paymentTransactions.id });

    if (inserted.length === 0) {
      const balance = await getPlasmaMinerals(input.playerId);
      return { duplicate: true as const, balance };
    }

    const [updated] = await tx
      .update(users)
      .set({
        plasmaMinerals: sql`${users.plasmaMinerals} + ${pack.amount}`,
        updatedAt: now,
      })
      .where(eq(users.id, input.playerId))
      .returning({ plasmaMinerals: users.plasmaMinerals });

    if (!updated) {
      throw new Error('User not found while crediting plasma minerals');
    }

    return { duplicate: false as const, balance: updated.plasmaMinerals };
  });

  if (!result.duplicate) {
    console.log(
      `[payments] credited ${pack.amount} plasma to ${input.playerId} for order ${input.orderId} (pack ${input.packId})`,
    );
  }

  return {
    duplicate: result.duplicate,
    amountGranted: pack.amount,
    plasmaMinerals: result.balance,
  };
}

export type WebhookCreditResult =
  | { readonly ok: true; readonly duplicate: boolean; readonly ignored?: false }
  | { readonly ok: true; readonly ignored: true; readonly reason: string }
  | { readonly ok: false; readonly error: string; readonly status: number };

/**
 * Sole wallet-credit path. Verify signature and credit exactly once for order_created.
 * Amount always comes from the server pack catalog.
 */
export async function handleLemonSqueezyWebhook(
  rawBody: Buffer,
  signatureHeader: string | undefined,
): Promise<WebhookCreditResult> {
  let config;
  try {
    config = getLemonSqueezyConfig();
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Lemon Squeezy not configured',
    };
  }

  if (!verifyLemonWebhookSignature(rawBody, signatureHeader, config.webhookSecret)) {
    return { ok: false, status: 401, error: 'Invalid webhook signature' };
  }

  let payload: LemonOrderWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as LemonOrderWebhookPayload;
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  }

  const eventName = payload.meta?.event_name;
  if (eventName !== 'order_created') {
    return { ok: true, ignored: true, reason: `Unhandled event: ${eventName ?? 'unknown'}` };
  }

  const orderId = payload.data?.id != null ? String(payload.data.id) : '';
  const status = payload.data?.attributes?.status;
  const variantRaw = payload.data?.attributes?.first_order_item?.variant_id;
  const custom = payload.meta?.custom_data ?? {};
  const playerId =
    typeof custom.playerId === 'string'
      ? custom.playerId.trim()
      : typeof custom.player_id === 'string'
        ? custom.player_id.trim()
        : '';
  const customPackId =
    typeof custom.packId === 'string'
      ? custom.packId.trim()
      : typeof custom.pack_id === 'string'
        ? custom.pack_id.trim()
        : '';

  if (!orderId) {
    return { ok: false, status: 400, error: 'Missing order id' };
  }
  if (status && status !== 'paid') {
    return { ok: true, ignored: true, reason: `Order status is ${status}` };
  }
  if (variantRaw == null) {
    return { ok: false, status: 400, error: 'Missing variant id' };
  }
  if (!playerId) {
    return { ok: false, status: 400, error: 'Missing playerId in custom data' };
  }

  const packId = getPackIdForVariant(variantRaw);
  if (!packId) {
    return { ok: false, status: 400, error: `Unknown Lemon variant: ${variantRaw}` };
  }
  if (customPackId && customPackId !== packId) {
    return {
      ok: false,
      status: 400,
      error: `Custom packId ${customPackId} does not match variant pack ${packId}`,
    };
  }

  try {
    const credited = await creditLemonOrder({
      orderId,
      playerId,
      packId,
      lemonVariantId: String(variantRaw),
    });
    return { ok: true, duplicate: credited.duplicate };
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Could not credit order',
    };
  }
}
