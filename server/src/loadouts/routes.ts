import type { Express, Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
  createWeaponLoadout,
  deleteWeaponLoadout,
  listWeaponLoadouts,
  setDefaultWeaponLoadout,
  updateWeaponLoadout,
} from './service.js';

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (typeof value !== 'boolean') return undefined;
  return value;
}

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function loadoutIdParam(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function registerLoadoutRoutes(app: Express): void {
  app.get('/api/me/loadouts', requireAuth, async (req, res) => {
    try {
      const data = await listWeaponLoadouts(req.auth!);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not load loadouts');
    }
  });

  app.post('/api/me/loadouts', requireAuth, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = readString(body, 'name');
    const primaryWeaponId = readString(body, 'primaryWeaponId');
    const secondaryWeaponId = readString(body, 'secondaryWeaponId');
    const isDefault = readOptionalBoolean(body, 'isDefault');

    if (!name || !primaryWeaponId || !secondaryWeaponId) {
      return sendError(res, 400, 'name, primaryWeaponId, and secondaryWeaponId are required');
    }

    try {
      const data = await createWeaponLoadout(req.auth!, {
        name,
        primaryWeaponId,
        secondaryWeaponId,
        isDefault,
      });
      res.status(201).json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not create loadout');
    }
  });

  app.patch('/api/me/loadouts/:loadoutId', requireAuth, async (req, res) => {
    const loadoutId = loadoutIdParam(req.params.loadoutId);
    if (!loadoutId) {
      return sendError(res, 400, 'Loadout id is required');
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = readOptionalString(body, 'name');
    const primaryWeaponId = readOptionalString(body, 'primaryWeaponId');
    const secondaryWeaponId = readOptionalString(body, 'secondaryWeaponId');
    const isDefault = readOptionalBoolean(body, 'isDefault');

    if (
      name === undefined &&
      primaryWeaponId === undefined &&
      secondaryWeaponId === undefined &&
      isDefault === undefined
    ) {
      return sendError(res, 400, 'No loadout changes provided');
    }

    try {
      const data = await updateWeaponLoadout(req.auth!, loadoutId, {
        ...(name !== undefined ? { name } : {}),
        ...(primaryWeaponId !== undefined ? { primaryWeaponId } : {}),
        ...(secondaryWeaponId !== undefined ? { secondaryWeaponId } : {}),
        ...(isDefault !== undefined ? { isDefault } : {}),
      });
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not update loadout');
    }
  });

  app.post('/api/me/loadouts/:loadoutId/default', requireAuth, async (req, res) => {
    const loadoutId = loadoutIdParam(req.params.loadoutId);
    if (!loadoutId) {
      return sendError(res, 400, 'Loadout id is required');
    }

    try {
      const data = await setDefaultWeaponLoadout(req.auth!, loadoutId);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not set default loadout');
    }
  });

  app.delete('/api/me/loadouts/:loadoutId', requireAuth, async (req, res) => {
    const loadoutId = loadoutIdParam(req.params.loadoutId);
    if (!loadoutId) {
      return sendError(res, 400, 'Loadout id is required');
    }

    try {
      const data = await deleteWeaponLoadout(req.auth!, loadoutId);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not delete loadout');
    }
  });
}
