import type { Express, Response } from 'express';
import type { EquipWeaponSightRequest } from '../../../shared/api/weaponUnlockables.js';
import { requireAuth } from '../auth/middleware.js';
import {
  equipWeaponSight,
  listWeaponUnlockables,
  purchaseWeaponUnlockable,
  sellWeaponUnlockable,
} from './service.js';

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

export function registerWeaponUnlockableRoutes(app: Express): void {
  app.get('/api/me/weapon-unlockables', requireAuth, async (req, res) => {
    try {
      const data = await listWeaponUnlockables(req.auth!);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not load unlockables');
    }
  });

  app.put('/api/me/weapon-sights', requireAuth, async (req, res) => {
    try {
      const body = (req.body ?? {}) as EquipWeaponSightRequest;
      const weaponId = typeof body.weaponId === 'string' ? body.weaponId : '';
      const sightId =
        body.sightId === null || body.sightId === undefined
          ? null
          : typeof body.sightId === 'string'
            ? body.sightId
            : null;
      if (body.sightId !== null && body.sightId !== undefined && typeof body.sightId !== 'string') {
        sendError(res, 400, 'Invalid sight id');
        return;
      }
      const data = await equipWeaponSight(req.auth!, weaponId, sightId);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not equip sight');
    }
  });

  app.post(
    '/api/me/weapon-unlockables/:unlockableId/purchase',
    requireAuth,
    async (req, res) => {
      try {
        const unlockableId = Array.isArray(req.params.unlockableId)
          ? req.params.unlockableId[0]
          : req.params.unlockableId;
        const data = await purchaseWeaponUnlockable(req.auth!, unlockableId ?? '');
        res.json(data);
      } catch (error) {
        sendError(
          res,
          400,
          error instanceof Error ? error.message : 'Could not purchase unlockable',
        );
      }
    },
  );

  app.post('/api/me/weapon-unlockables/:unlockableId/sell', requireAuth, async (req, res) => {
    try {
      const unlockableId = Array.isArray(req.params.unlockableId)
        ? req.params.unlockableId[0]
        : req.params.unlockableId;
      const data = await sellWeaponUnlockable(req.auth!, unlockableId ?? '');
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not sell unlockable');
    }
  });
}
