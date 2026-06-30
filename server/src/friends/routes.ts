import type { Express, Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
  listFriends,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from './service.js';

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

export function registerFriendsRoutes(app: Express): void {
  app.get('/api/friends', requireAuth, async (req, res) => {
    try {
      const data = await listFriends(req.auth!);
      res.json(data);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not load friends');
    }
  });

  app.post('/api/friends/request', requireAuth, async (req, res) => {
    const email = readString(req.body, 'email');
    if (!email) {
      return sendError(res, 400, 'Email is required');
    }

    try {
      const request = await sendFriendRequest(req.auth!, email);
      res.json({ request });
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not send request');
    }
  });

  app.post('/api/friends/respond', requireAuth, async (req, res) => {
    const requestId = readString(req.body, 'requestId');
    const accepted = req.body.accepted === true;

    if (!requestId) {
      return sendError(res, 400, 'Request id is required');
    }

    try {
      const result = await respondToFriendRequest(req.auth!, requestId, accepted);
      res.json(result);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not respond to request');
    }
  });

  app.delete('/api/friends/:friendUserId', requireAuth, async (req, res) => {
    const friendUserId = typeof req.params.friendUserId === 'string'
      ? req.params.friendUserId.trim()
      : '';

    if (!friendUserId) {
      return sendError(res, 400, 'Friend id is required');
    }

    try {
      await removeFriend(req.auth!, friendUserId);
      res.json({ success: true });
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not remove friend');
    }
  });
}
