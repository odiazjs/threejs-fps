import type { Express, Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { getGlobalLeaderboard } from './service.js';

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

export function registerLeaderboardRoutes(app: Express): void {
  app.get('/api/leaderboard', requireAuth, async (_req, res) => {
    try {
      const players = await getGlobalLeaderboard();
      res.json({ players });
    } catch (error) {
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Could not load leaderboard',
      );
    }
  });
}
