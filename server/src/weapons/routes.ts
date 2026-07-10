import type { Express, Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
  batchUpgradePlayerWeaponStats,
  listPlayerWeapons,
  listWeapons,
  upgradePlayerWeaponStat,
} from './service.js';

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function registerWeaponRoutes(app: Express): void {
  app.get('/api/weapons', async (req, res) => {
    try {
      const loadoutEligibleOnly = req.query.loadoutEligible === 'true';
      const includeDisabled = req.query.includeDisabled === 'true';
      const data = await listWeapons({
        loadoutEligibleOnly,
        enabledOnly: !includeDisabled,
      });
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not load weapons');
    }
  });

  app.get('/api/me/weapons', requireAuth, async (req, res) => {
    try {
      const data = await listPlayerWeapons(req.auth!);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not load weapon upgrades');
    }
  });

  app.post('/api/me/weapons/:weaponId/upgrade', requireAuth, async (req, res) => {
    const weaponId =
      typeof req.params.weaponId === 'string' ? req.params.weaponId.trim() : '';
    if (!weaponId) {
      return sendError(res, 400, 'Weapon id is required');
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const stat = readString(body, 'stat');
    if (!stat) {
      return sendError(res, 400, 'stat is required');
    }

    const deltaRaw = body.delta;
    const delta =
      deltaRaw === undefined || deltaRaw === null
        ? 1
        : typeof deltaRaw === 'number'
          ? deltaRaw
          : Number(deltaRaw);

    try {
      const data = await upgradePlayerWeaponStat(req.auth!, weaponId, stat, delta);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not upgrade weapon');
    }
  });

  app.post('/api/me/weapons/:weaponId/upgrades', requireAuth, async (req, res) => {
    const weaponId =
      typeof req.params.weaponId === 'string' ? req.params.weaponId.trim() : '';
    if (!weaponId) {
      return sendError(res, 400, 'Weapon id is required');
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const deltas =
      body.deltas && typeof body.deltas === 'object' && !Array.isArray(body.deltas)
        ? (body.deltas as Partial<Record<string, number>>)
        : null;
    if (!deltas) {
      return sendError(res, 400, 'deltas object is required');
    }

    try {
      const data = await batchUpgradePlayerWeaponStats(req.auth!, weaponId, deltas);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not save upgrades');
    }
  });
}
