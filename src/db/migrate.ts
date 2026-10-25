import dotenv from 'dotenv';
import { runPostgresMigrations, testPostgresConnection } from './postgres.ts';

dotenv.config();

async function main() {
  console.log('[Migrate]: Verifying PostgreSQL connection...');
  const test = await testPostgresConnection();
  if (!test.ok) {
    console.error('[Migrate Error]:', test.message);
    process.exit(1);
  }

  console.log('[Migrate]: Applying migrations...');
  const result = await runPostgresMigrations();
  if (result.success) {
    console.log('[Migrate Success]:', result.message);
    process.exit(0);
  } else {
    console.error('[Migrate Failed]:', result.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[Migrate Fatal]:', err);
  process.exit(1);
});
