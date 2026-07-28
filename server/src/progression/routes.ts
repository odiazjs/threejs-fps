import type { Express, Response } from 'express';
import type { SubmitMatchResultRequest } from '../../../shared/api/matchRewards.js';
import { requireAuth } from '../auth/middleware.js';
import {
  claimSeasonReward,
  getRankProgression,
  listRankLadder,
  submitPlayerMatchResult,
} from './service.js';

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

export function registerProgressionRoutes(app: Express): void {
  /** Full rank progression screen payload for the signed-in player. */
  app.get('/api/me/rank', requireAuth, async (req, res) => {
    try {
      const data = await getRankProgression(req.auth!);
      res.json(data);
    } catch (error) {
      sendError(
        res,
        400,
        error instanceof Error ? error.message : 'Could not load rank progression',
      );
    }
  });

  /** Rank list + RP thresholds (catalog). */
  app.get('/api/ranks', requireAuth, async (_req, res) => {
    try {
      const ranks = await listRankLadder();
      res.json({ ranks });
    } catch (error) {
      sendError(
        res,
        400,
        error instanceof Error ? error.message : 'Could not load ranks',
      );
    }
  });

  /** Claim an unlocked season track reward (credits / character / skin). */
  app.post('/api/me/rank/season-rewards/:level/claim', requireAuth, async (req, res) => {
    try {
      const level = Number(req.params.level);
      if (!Number.isFinite(level)) {
        sendError(res, 400, 'Invalid season reward level');
        return;
      }
      const data = await claimSeasonReward(req.auth!, level);
      res.json(data);
    } catch (error) {
      sendError(
        res,
        400,
        error instanceof Error ? error.message : 'Could not claim season reward',
      );
    }
  });

  /**
   * Post-match performance upload → XP / RP calculation + persistence.
   * Idempotent per (matchId, user). Returns award breakdown (no UI yet).
   */
  app.post('/api/me/rank/match-result', requireAuth, async (req, res) => {
    try {
      const body = (req.body ?? {}) as Partial<SubmitMatchResultRequest>;
      if (!body.matchId || !body.performance || typeof body.performance !== 'object') {
        sendError(res, 400, 'matchId and performance are required');
        return;
      }
      if (typeof body.teamId !== 'number' || typeof body.winningTeamId !== 'number') {
        sendError(res, 400, 'teamId and winningTeamId are required');
        return;
      }
      const data = await submitPlayerMatchResult(req.auth!, {
        matchId: String(body.matchId),
        roomId: String(body.roomId ?? ''),
        mapId: String(body.mapId ?? 'unknown'),
        mode: body.mode ? String(body.mode) : 'tdm',
        teamId: body.teamId,
        winningTeamId: body.winningTeamId,
        matchStartAt:
          typeof body.matchStartAt === 'number' ? body.matchStartAt : undefined,
        matchDurationSec:
          typeof body.matchDurationSec === 'number'
            ? body.matchDurationSec
            : undefined,
        performance: body.performance,
        wasMvp: Boolean(body.wasMvp),
      });
      res.json(data);
    } catch (error) {
      sendError(
        res,
        400,
        error instanceof Error ? error.message : 'Could not submit match result',
      );
    }
  });
}
