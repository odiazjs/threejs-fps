import type { Express, Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { listCharacters, selectCharacter } from './service.js';

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function registerCharacterRoutes(app: Express): void {
  app.get('/api/me/characters', requireAuth, async (req, res) => {
    try {
      const data = await listCharacters(req.auth!);
      res.json(data);
    } catch (error) {
      sendError(
        res,
        400,
        error instanceof Error ? error.message : 'Could not load characters',
      );
    }
  });

  app.post('/api/me/characters/select', requireAuth, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const characterId = readString(body, 'characterId');
    if (!characterId) {
      return sendError(res, 400, 'characterId is required');
    }

    try {
      const data = await selectCharacter(req.auth!, characterId);
      res.json(data);
    } catch (error) {
      sendError(
        res,
        400,
        error instanceof Error ? error.message : 'Could not select character',
      );
    }
  });
}
