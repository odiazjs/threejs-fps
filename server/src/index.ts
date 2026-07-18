import 'dotenv/config';
import { configureColyseusCors } from './api/cors.js';
import { initPresenceNotifications } from './lobby/presenceNotify.js';
import { closeDb, connectDb } from './db/index.js';
import { initRapier } from '../../shared/physics/rapierInit.js';
import server from './app.config.js';

const port = Number(process.env.PORT) || 4001;

async function maybeRunMigrations(): Promise<void> {
  if (process.env.MIGRATE_ON_START !== 'true') return;
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { getDb } = await import('./db/index.js');

  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../drizzle',
  );
  console.log(`[db] MIGRATE_ON_START — applying migrations from ${migrationsFolder}`);
  await migrate(getDb(), { migrationsFolder });
}

async function main(): Promise<void> {
  configureColyseusCors();
  initPresenceNotifications();

  await connectDb();
  console.log('[db] connected');

  await initRapier();
  console.log('[physics] Rapier initialized');

  const { warmTdmMapPhysics } = await import('./level/tdmMapPhysicsCache.js');
  void warmTdmMapPhysics().catch((error) => {
    console.warn('[physics] Chrono-Bowl collision warm-up failed (will retry on first match)', error);
  });

  const { warmFiringRangePhysics } = await import('./level/firingRangePhysicsCache.js');
  void warmFiringRangePhysics().catch((error) => {
    console.warn('[physics] Firing Range collision warm-up failed (will retry on first match)', error);
  });

  await maybeRunMigrations();

  const { ensureCharacterCatalogLoaded } = await import('./characters/catalogCache.js');
  await ensureCharacterCatalogLoaded();
  console.log('[db] character catalog cached');

  server.listen(port);
  console.log(`[Colyseus] listening on http://localhost:${port}`);
}

function shutdown(): void {
  void closeDb().finally(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((error) => {
  console.error('[server] failed to start:', error);
  process.exit(1);
});

