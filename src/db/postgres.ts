import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var _appPostgresPool: pg.Pool | undefined;
}

export interface SafePostgresConfig {
  host: string;
  user: string;
  password?: string;
  database: string;
  port: number;
  ssl?: any;
}

export function parsePostgresConnectionString(raw?: string): SafePostgresConfig | null {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();
  if (!str.startsWith('postgres://') && !str.startsWith('postgresql://')) {
    return null;
  }

  // Regex handles passwords with special characters (brackets, slashes, ?, &, etc.)
  const regex = /^(?:postgres(?:ql)?:\/\/)([^:@\s]+)(?::([^@\s]+))?@([^:\/\s]+)(?::(\d+))?(?:\/([^?\s]+))?(?:\?(.*))?$/;
  const match = str.match(regex);
  if (match) {
    const [, user, pass, host, port, db] = match;
    let cleanPass = pass;
    // Strip accidental surrounding brackets from copy-pasting template e.g. [my-password]
    if (cleanPass && cleanPass.startsWith('[') && cleanPass.endsWith(']')) {
      cleanPass = cleanPass.slice(1, -1);
    }

    const isLocal = host === 'localhost' || host === '127.0.0.1';
    return {
      user: decodeURIComponent(user || 'postgres'),
      password: cleanPass ? decodeURIComponent(cleanPass) : undefined,
      host,
      port: port ? parseInt(port, 10) : 5432,
      database: db || 'postgres',
      ssl: isLocal ? false : { rejectUnauthorized: false },
    };
  }

  // Fallback parser using URL
  try {
    const parsed = new URL(str);
    let pass = parsed.password;
    if (pass.startsWith('[') && pass.endsWith(']')) {
      pass = pass.slice(1, -1);
    }
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    return {
      user: decodeURIComponent(parsed.username || 'postgres'),
      password: pass ? decodeURIComponent(pass) : undefined,
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'postgres',
      ssl: isLocal ? false : { rejectUnauthorized: false },
    };
  } catch (err) {
    console.warn('[PostgreSQL Config Warning]: Could not parse connection string:', err);
    return null;
  }
}

export function isPostgresConfigured(): boolean {
  if (process.env.DATABASE_URL) {
    const parsed = parsePostgresConnectionString(process.env.DATABASE_URL);
    return Boolean(parsed && parsed.host);
  }
  return Boolean(
    process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_DB_NAME
  );
}

export function isSupabaseDatabase(): boolean {
  const url = process.env.DATABASE_URL || '';
  const host = process.env.SQL_HOST || '';
  return url.includes('supabase.co') || url.includes('supabase.com') || host.includes('supabase');
}

export function getPostgresPool(): pg.Pool | null {
  if (!isPostgresConfigured()) {
    return null;
  }

  if (!global._appPostgresPool) {
    if (process.env.DATABASE_URL) {
      const parsed = parsePostgresConnectionString(process.env.DATABASE_URL);
      if (!parsed) {
        return null;
      }
      global._appPostgresPool = new Pool({
        host: parsed.host,
        user: parsed.user,
        password: parsed.password,
        port: parsed.port,
        database: parsed.database,
        ssl: parsed.ssl,
        max: 10,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
      });
    } else {
      global._appPostgresPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432,
        ssl: { rejectUnauthorized: false },
        max: 10,
        connectionTimeoutMillis: 10000,
      });
    }

    global._appPostgresPool.on('error', (err) => {
      console.error('[Postgres Pool Error]:', err.message);
    });
  }

  return global._appPostgresPool;
}

export async function testPostgresConnection(): Promise<{
  ok: boolean;
  message: string;
  version?: string;
  isSupabase?: boolean;
  tableCount?: number;
}> {
  if (!isPostgresConfigured()) {
    return {
      ok: false,
      message: 'PostgreSQL is not configured. Set DATABASE_URL in environment (or in Render Environment Variables) to connect.',
      isSupabase: false,
    };
  }

  const pool = getPostgresPool();
  if (!pool) {
    return { ok: false, message: 'Could not create PostgreSQL pool instance.' };
  }

  try {
    const res = await pool.query('SELECT version()');
    const tableRes = await pool.query(`
      SELECT count(*) AS count FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const count = parseInt(tableRes.rows[0]?.count || '0', 10);

    return {
      ok: true,
      message: isSupabaseDatabase()
        ? `Supabase PostgreSQL connected successfully (${count} tables found)!`
        : 'PostgreSQL connection verified successfully.',
      version: res.rows[0]?.version || 'PostgreSQL connected',
      isSupabase: isSupabaseDatabase(),
      tableCount: count,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Failed to connect to PostgreSQL: ${errorMsg}`,
      isSupabase: isSupabaseDatabase(),
    };
  }
}

export async function runPostgresMigrations(): Promise<{ success: boolean; message: string }> {
  const pool = getPostgresPool();
  if (!pool) {
    return { success: false, message: 'PostgreSQL not configured, skipping migration.' };
  }

  try {
    let sql = '';
    const supabaseFile = path.resolve(process.cwd(), 'supabase_schema.sql');
    const migrationFile = path.resolve(process.cwd(), 'migrations', '001_initial_schema.sql');

    if (fs.existsSync(supabaseFile)) {
      sql = fs.readFileSync(supabaseFile, 'utf8');
    } else if (fs.existsSync(migrationFile)) {
      sql = fs.readFileSync(migrationFile, 'utf8');
    } else {
      return { success: false, message: 'No schema SQL file found.' };
    }

    await pool.query(sql);
    console.log('[Postgres Migration] Schema applied and verified successfully.');
    return { success: true, message: 'Database schema and initial profile knowledge applied successfully.' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[Postgres Migration Error]:', errorMsg);
    return { success: false, message: `Migration error: ${errorMsg}` };
  }
}
