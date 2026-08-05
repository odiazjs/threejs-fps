import type { Express, Response } from 'express';
import express from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
  createPlasmaCheckout,
  getPlasmaPurchaseStatus,
  handleLemonSqueezyWebhook,
} from './service.js';

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Webhook must be registered with raw body BEFORE global express.json.
 * This is the only path that credits plasma minerals from real money.
 */
export function registerLemonSqueezyWebhookRoute(app: Express): void {
  app.post(
    '/api/webhooks/lemonsqueezy',
    express.raw({ type: 'application/json', limit: '1mb' }),
    async (req, res) => {
      try {
        const rawBody = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(typeof req.body === 'string' ? req.body : '', 'utf8');
        const signature = req.get('X-Signature') ?? undefined;
        const result = await handleLemonSqueezyWebhook(rawBody, signature);

        if (!result.ok) {
          console.warn('[payments] webhook rejected', result.status, result.error);
          return sendError(res, result.status, result.error);
        }

        if ('ignored' in result && result.ignored) {
          return res.status(200).json({ ok: true, ignored: true, reason: result.reason });
        }

        console.log('[payments] webhook ok', { duplicate: result.duplicate });
        return res.status(200).json({
          ok: true,
          duplicate: result.duplicate,
        });
      } catch (error) {
        console.error('[payments] webhook error', error);
        return sendError(
          res,
          500,
          error instanceof Error ? error.message : 'Webhook processing failed',
        );
      }
    },
  );
}

export function registerPaymentRoutes(app: Express): void {
  app.post('/api/payments/checkout', requireAuth, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const packId = readString(body, 'packId');
    if (!packId) {
      return sendError(res, 400, 'packId is required');
    }

    try {
      const data = await createPlasmaCheckout(req.auth!, packId);
      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create checkout';
      const status =
        message.includes('not configured') || message.includes('LEMONSQUEEZY')
          ? 503
          : 400;
      sendError(res, status, message);
    }
  });

  /** Read-only: wait for webhook credit before showing congrats. Never credits. */
  app.get('/api/payments/status', requireAuth, async (req, res) => {
    const packId =
      typeof req.query.packId === 'string' ? req.query.packId.trim() : '';
    if (!packId) {
      return sendError(res, 400, 'packId is required');
    }

    try {
      const data = await getPlasmaPurchaseStatus(req.auth!, packId);
      res.json(data);
    } catch (error) {
      sendError(
        res,
        400,
        error instanceof Error ? error.message : 'Could not load purchase status',
      );
    }
  });
}
