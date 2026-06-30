import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { resolveDatabaseUrl } from './src/db/config.js';

/** Drizzle Kit reads schema files for `generate`; URL is only required for push/studio. */
function kitDatabaseUrl(): string {
  try {
    return resolveDatabaseUrl();
  } catch {
    return 'postgresql://localhost:5432/postgres';
  }
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: kitDatabaseUrl(),
  },
  strict: true,
  verbose: true,
});
