import type { Express, Request, Response, NextFunction } from 'express';
import { matchMaker } from 'colyseus';

const LOCAL_DEV_ORIGIN = 'http://localhost:5173';

function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim() || process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    return process.env.NODE_ENV === 'production' ? [] : [LOCAL_DEV_ORIGIN];
  }

  return [...new Set(raw.split(',').map((entry) => entry.trim()).filter(Boolean))];
}

/** Origin to echo in Access-Control-Allow-Origin, or null if not allowed. */
export function resolveAllowedOrigin(requestOrigin: string | null | undefined): string | null {
  const allowed = parseAllowedOrigins();
  if (allowed.length === 0) return null;

  if (!requestOrigin) {
    return allowed.length === 1 ? allowed[0]! : null;
  }

  return allowed.includes(requestOrigin) ? requestOrigin : null;
}

export function buildCorsHeaders(requestOrigin: string | null | undefined): Record<string, string> {
  const origin = resolveAllowedOrigin(requestOrigin);
  if (!origin) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

function applyHeaders(res: Response, headers: Record<string, string>): void {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

function handleCors(req: Request, res: Response, next: NextFunction): void {
  const headers = buildCorsHeaders(req.headers.origin);
  const allowed = Boolean(headers['Access-Control-Allow-Origin']);

  if (!allowed) {
    if (req.method === 'OPTIONS') {
      res.status(403).end();
      return;
    }
    next();
    return;
  }

  applyHeaders(res, headers);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

export function applyApiCors(app: Express): void {
  app.use('/api', handleCors);
}

/** Colyseus handles OPTIONS before Express — align its CORS with our allowlist. */
export function configureColyseusCors(): void {
  const { controller } = matchMaker;
  const baseHeaders = { ...controller.DEFAULT_CORS_HEADERS };

  delete (baseHeaders as Record<string, string>)['Access-Control-Allow-Origin'];

  controller.DEFAULT_CORS_HEADERS = {
    ...baseHeaders,
    'Access-Control-Allow-Headers':
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS',
  };

  controller.getCorsHeaders = (headers: Headers) => ({
    ...controller.DEFAULT_CORS_HEADERS,
    ...buildCorsHeaders(headers.get('origin')),
  });

  const allowed = parseAllowedOrigins();
  if (allowed.length === 0) {
    console.warn(
      '[cors] No CORS_ORIGIN configured — browser clients on other domains will be blocked in production',
    );
  } else {
    console.log(`[cors] allowed origins: ${allowed.join(', ')}`);
  }
}
