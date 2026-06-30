import { apiLogout, apiRefresh, type AuthTokens } from './authApi';
import { displayNameFromEmail } from '../../shared/auth/displayName';
import { userIdFromIdToken } from './jwt';

export { displayNameFromEmail };

const SESSION_KEY = 'fps_auth_session';
const PENDING_AUTH_KEY = 'fps_pending_auth';

/** Refresh tokens ~60s before expiry. */
const EXPIRY_BUFFER_MS = 60_000;

export interface PlayerProfile {
  userId: string;
  email: string;
  username: string;
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface PendingAuth {
  email: string;
  password: string;
  cognitoUsername: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function savePendingAuth(
  email: string,
  password: string,
  cognitoUsername: string,
): void {
  sessionStorage.setItem(
    PENDING_AUTH_KEY,
    JSON.stringify({
      email: normalizeEmail(email),
      password,
      cognitoUsername,
    } satisfies PendingAuth),
  );
}

export function getPendingAuth(): PendingAuth | null {
  const raw = sessionStorage.getItem(PENDING_AUTH_KEY);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as Partial<PendingAuth>;
    if (!data.email || !data.password || !data.cognitoUsername) return null;
    return {
      email: normalizeEmail(data.email),
      password: data.password,
      cognitoUsername: data.cognitoUsername,
    };
  } catch {
    return null;
  }
}

export function clearPendingAuth(): void {
  sessionStorage.removeItem(PENDING_AUTH_KEY);
}

export function createSession(
  email: string,
  tokens: AuthTokens,
  _existing?: PlayerProfile | null,
): PlayerProfile {
  const normalizedEmail = normalizeEmail(email);

  return {
    userId: userIdFromIdToken(tokens.idToken),
    email: normalizedEmail,
    username: displayNameFromEmail(normalizedEmail),
    accessToken: tokens.accessToken,
    idToken: tokens.idToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  };
}

export function saveSession(profile: PlayerProfile): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
}

export function getSession(): PlayerProfile | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as Partial<PlayerProfile>;
    if (
      !data.email ||
      !data.accessToken ||
      !data.idToken ||
      !data.refreshToken ||
      typeof data.expiresAt !== 'number'
    ) {
      return null;
    }

    return {
      userId: data.userId || userIdFromIdToken(data.idToken) || '',
      email: normalizeEmail(data.email),
      username: displayNameFromEmail(data.email),
      accessToken: data.accessToken,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function isSessionExpired(session: PlayerProfile): boolean {
  return Date.now() >= session.expiresAt - EXPIRY_BUFFER_MS;
}

export async function refreshSessionTokens(
  session: PlayerProfile,
): Promise<PlayerProfile | null> {
  try {
    const tokens = await apiRefresh(session.refreshToken);
    const refreshed = createSession(session.email, tokens, session);
    saveSession(refreshed);
    return refreshed;
  } catch {
    clearSession();
    return null;
  }
}

export async function ensureSession(): Promise<PlayerProfile> {
  let session = getSession();
  if (!session) {
    redirectToSignIn();
    throw new Error('Not authenticated');
  }

  if (isSessionExpired(session)) {
    session = await refreshSessionTokens(session);
    if (!session) {
      redirectToSignIn();
      throw new Error('Session expired');
    }
  }

  if (!session.userId && session.idToken) {
    session = { ...session, userId: userIdFromIdToken(session.idToken) };
    saveSession(session);
  }

  return session;
}

export function requireSession(): PlayerProfile {
  const session = getSession();
  if (!session) {
    redirectToSignIn();
    throw new Error('Not authenticated');
  }
  return session;
}

export async function logout(): Promise<void> {
  const session = getSession();
  clearSession();
  clearPendingAuth();

  if (session?.accessToken) {
    try {
      await apiLogout(session.accessToken);
    } catch {
      // Local session is already cleared.
    }
  }

  window.location.href = '/';
}

function redirectToSignIn(): void {
  window.location.href = '/';
}

export function getKdRatio(stats: { kills: number; deaths: number }): string {
  if (stats.deaths === 0) {
    return stats.kills > 0 ? stats.kills.toFixed(2) : '0.00';
  }
  return (stats.kills / stats.deaths).toFixed(2);
}
