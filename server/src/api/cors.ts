import type { Express, Request, Response, NextFunction } from 'express';

function handleCors(req: Request, res: Response, next: NextFunction): void {
  const allowedOrigin = process.env.CORS_ORIGIN?.trim() || 'http://localhost:5173';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

export function applyApiCors(app: Express): void {
  app.use('/api', handleCors);
}
