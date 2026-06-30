import type { Express, Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { getMe } from './service.js';

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
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
}
