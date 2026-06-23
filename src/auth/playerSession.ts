const SESSION_KEY = 'fps_player_session';

export interface PlayerProfile {
  username: string;
  kills: number;
  deaths: number;
}

export function encodeSession(profile: PlayerProfile): string {
  return btoa(JSON.stringify(profile));
}

export function decodeSession(token: string): PlayerProfile | null {
  try {
    const data = JSON.parse(atob(token)) as Partial<PlayerProfile>;
    const username = data.username?.trim().slice(0, 16);
    if (!username) return null;

    return {
      username,
      kills: Math.max(0, Number(data.kills) || 0),
      deaths: Math.max(0, Number(data.deaths) || 0),
    };
  } catch {
    return null;
  }
}

export function getSession(): PlayerProfile | null {
  const token = localStorage.getItem(SESSION_KEY);
  if (!token) return null;
  return decodeSession(token);
}

export function saveSession(profile: PlayerProfile): void {
  localStorage.setItem(SESSION_KEY, encodeSession(profile));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function registerUsername(username: string): PlayerProfile {
  const trimmed = username.trim().slice(0, 16);
  const existing = getSession();
  const profile: PlayerProfile = {
    username: trimmed,
    kills: existing?.username === trimmed ? existing.kills : 0,
    deaths: existing?.username === trimmed ? existing.deaths : 0,
  };
  saveSession(profile);
  return profile;
}

export function recordKill(username: string): void {
  const session = getSession();
  if (!session || session.username !== username) return;
  saveSession({ ...session, kills: session.kills + 1 });
}

export function recordDeath(username: string): void {
  const session = getSession();
  if (!session || session.username !== username) return;
  saveSession({ ...session, deaths: session.deaths + 1 });
}

export function getKdRatio(profile: PlayerProfile): string {
  if (profile.deaths === 0) {
    return profile.kills > 0 ? profile.kills.toFixed(2) : '0.00';
  }
  return (profile.kills / profile.deaths).toFixed(2);
}

export function requireSession(): PlayerProfile {
  const session = getSession();
  if (!session) {
    window.location.href = '/';
    throw new Error('Not authenticated');
  }
  return session;
}
