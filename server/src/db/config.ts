function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** Render and most hosts provide DATABASE_URL; individual vars are a local fallback. */
export function resolveDatabaseUrl(): string {
  const direct = readEnv('DATABASE_URL');
  if (direct) return direct;

  const host = readEnv('DB_HOST');
  const port = readEnv('DB_PORT') ?? '5432';
  const user = readEnv('DB_USER');
  const password = readEnv('DB_PASSWORD');
  const database = readEnv('DB_NAME');

  if (!host || !user || !password || !database) {
    throw new Error(
      'Database not configured. Set DATABASE_URL or DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME.',
    );
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${database}`;
}

export function shouldUseSsl(connectionString: string): boolean {
  if (readEnv('DB_SSL') === 'true') return true;
  if (readEnv('DB_SSL') === 'false') return false;

  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode');
    if (sslMode === 'require' || sslMode === 'verify-full' || sslMode === 'verify-ca') {
      return true;
    }
  } catch {
    // Non-URL connection strings fall through to host-based detection.
  }

  const host = readEnv('DB_HOST');
  return Boolean(host && !host.includes('localhost') && !host.startsWith('127.'));
}
