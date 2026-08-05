import type { Express, Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { isPlasmaPurchaseMockEnabled } from '../payments/config.js';
import { getMe, purchasePlasmaMinerals } from './service.js';

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function registerMeRoutes(app: Express): void {
  app.get('/api/me', requireAuth, async (req, res) => {
    try {
      const data = await getMe(req.auth!);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not load profile');
    }
  });

  /** Offline-only mock credit. Production uses POST /api/payments/checkout. */
  app.post('/api/me/plasma-minerals/purchase', requireAuth, async (req, res) => {
    if (!isPlasmaPurchaseMockEnabled()) {
      return sendError(
        res,
        403,
        'Mock plasma purchases are disabled. Use Lemon Squeezy checkout.',
      );
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const packId = readString(body, 'packId');
    if (!packId) {
      return sendError(res, 400, 'packId is required');
    }

    try {
      const data = await purchasePlasmaMinerals(req.auth!, packId);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not purchase minerals');
    }
  });
}
