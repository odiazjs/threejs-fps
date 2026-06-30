import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { displayNameFromEmail } from '../../../shared/auth/displayName.js';
import { getDb } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { getEmailFromAccessToken } from './cognito.js';

export interface AuthContext {
  sub: string;
  email?: string;
  displayName?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let accessVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getAccessVerifier() {
  if (!accessVerifier) {
    accessVerifier = CognitoJwtVerifier.create({
      userPoolId: requireEnv('COGNITO_USER_POOL_ID'),
      tokenUse: 'access',
      clientId: requireEnv('COGNITO_CLIENT_ID'),
    });
  }
  return accessVerifier;
}

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

async function resolveProfile(sub: string, accessToken: string): Promise<Pick<AuthContext, 'email' | 'displayName'>> {
  const db = getDb();
  const [existing] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, sub))
    .limit(1);

  const email = existing?.email ?? (await getEmailFromAccessToken(accessToken));
  return {
    email,
    displayName: displayNameFromEmail(email),
  };
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const accessToken = readBearerToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }

  try {
    const payload = await getAccessVerifier().verify(accessToken);
    const sub = payload.sub;
    if (!sub) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const profile = await resolveProfile(sub, accessToken);
    req.auth = { sub, ...profile };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
