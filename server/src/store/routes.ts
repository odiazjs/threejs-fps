import type { Express, Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
  listStoreItems,
  purchaseStoreItem,
  selectStoreItem,
  sellStoreItem,
} from './service.js';

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function registerStoreRoutes(app: Express): void {
  app.get('/api/me/store/items', requireAuth, async (req, res) => {
    try {
      const data = await listStoreItems(req.auth!);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not load store');
    }
  });

  app.post('/api/me/store/items/:itemId/purchase', requireAuth, async (req, res) => {
    try {
      const itemId = Array.isArray(req.params.itemId)
        ? req.params.itemId[0]
        : req.params.itemId;
      const data = await purchaseStoreItem(req.auth!, itemId ?? '');
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not purchase item');
    }
  });

  app.post('/api/me/store/items/:itemId/sell', requireAuth, async (req, res) => {
    try {
      const itemId = Array.isArray(req.params.itemId)
        ? req.params.itemId[0]
        : req.params.itemId;
      const data = await sellStoreItem(req.auth!, itemId ?? '');
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not sell item');
    }
  });

  app.post('/api/me/store/items/select', requireAuth, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const itemId = readString(body, 'itemId');
    if (!itemId) {
      return sendError(res, 400, 'itemId is required');
    }

    try {
      const data = await selectStoreItem(req.auth!, itemId);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not select item');
    }
  });
}
