export function parseJwtPayload(token: string): Record<string, unknown> {
  const segment = token.split('.')[1];
  if (!segment) {
    throw new Error('Invalid token');
  }

  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(padded);
  return JSON.parse(json) as Record<string, unknown>;
}

export function userIdFromIdToken(idToken: string): string {
  try {
    const payload = parseJwtPayload(idToken);
    return typeof payload.sub === 'string' ? payload.sub : '';
  } catch {
    return '';
  }
}
