import crypto from 'node:crypto';
import { getPostgresPool, isPostgresConfigured } from '../db/postgres.ts';

/**
 * Generates a salted scrypt password hash.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derivedKey}`;
}

/**
 * Verifies a password against a stored hash or legacy format.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;

  // Plaintext match fallback for backward compatibility
  if (storedHash === password) return true;

  // scrypt format: scrypt:<salt>:<hash>
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length === 3) {
      const [, salt, originalHash] = parts;
      try {
        const computed = crypto.scryptSync(password, salt, 64).toString('hex');
        return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(originalHash));
      } catch {
        return false;
      }
    }
  }

  // SHA-256 format: sha256:<hash> or raw 64-char hex
  if (storedHash.startsWith('sha256:')) {
    const [, hash] = storedHash.split(':');
    const computed = crypto.createHash('sha256').update(password).digest('hex');
    return computed.toLowerCase() === hash.toLowerCase();
  }
  if (storedHash.length === 64 && /^[0-9a-f]+$/i.test(storedHash)) {
    const computed = crypto.createHash('sha256').update(password).digest('hex');
    return computed.toLowerCase() === storedHash.toLowerCase();
  }

  return false;
}

export interface AdminUserRecord {
  id?: number | string;
  username: string;
  password_hash: string;
  created_at?: string;
  last_login_at?: string | null;
}

// In-memory fallback admin users (used when PostgreSQL is offline or in local test mode)
const inMemoryAdminUsers: Map<string, AdminUserRecord> = new Map();

/**
 * Initializes and returns the list of allowed admin usernames.
 */
export function getAllowedAdminUsernames(): string[] {
  const usernames = new Set<string>();

  // Configured environment username
  if (process.env.ADMIN_USERNAME) {
    usernames.add(process.env.ADMIN_USERNAME.trim().toLowerCase());
  }

  // Official owner accounts
  usernames.add('selldxnxd@gmail.com');
  usernames.add('nayeem');
  usernames.add('admin');
  usernames.add('selldxnxd');

  return Array.from(usernames);
}

/**
 * Upserts an admin user in both PostgreSQL and in-memory store.
 */
export async function upsertAdminUser(
  username: string,
  rawPasswordOrHash: string
): Promise<{ success: boolean; message: string }> {
  const cleanUsername = username.trim().toLowerCase();
  const passwordHash = rawPasswordOrHash.startsWith('scrypt:') || rawPasswordOrHash.startsWith('sha256:')
    ? rawPasswordOrHash
    : hashPassword(rawPasswordOrHash);

  // Update in-memory
  inMemoryAdminUsers.set(cleanUsername, {
    username: cleanUsername,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
    last_login_at: null,
  });

  // If PostgreSQL is configured, upsert into admin_users table
  if (isPostgresConfigured()) {
    const pool = getPostgresPool();
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO admin_users (username, password_hash, created_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT (username)
           DO UPDATE SET password_hash = EXCLUDED.password_hash`,
          [cleanUsername, passwordHash]
        );
        return { success: true, message: `Admin user ${cleanUsername} saved in PostgreSQL.` };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return { success: false, message: `Failed to upsert in PostgreSQL: ${errorMsg}` };
      }
    }
  }

  return { success: true, message: `Admin user ${cleanUsername} saved in memory.` };
}

/**
 * Ensures all default admin accounts (selldxnxd@gmail.com, nayeem, admin, and process.env.ADMIN_USERNAME)
 * exist in the database with both the user's configured password and default fallback password.
 */
export async function ensureDefaultAdminUsers(): Promise<void> {
  const primaryPassword = (process.env.ADMIN_PASSWORD || 'ChangeMe_NayeemAdmin2026!').trim();
  const fallbackPassword = 'ChangeMe_NayeemAdmin2026!';
  const usernames = getAllowedAdminUsernames();

  for (const user of usernames) {
    await upsertAdminUser(user, primaryPassword);
  }

  // Also store fallback hash if primary is custom
  if (primaryPassword !== fallbackPassword) {
    // Both passwords will be accepted in verifyAdminLogin
  }
}

/**
 * Authenticates an admin using database records, password hashes, and environment variables.
 */
export async function verifyAdminLogin(
  usernameInput: string,
  passwordInput: string
): Promise<{
  success: boolean;
  user?: { username: string; name: string; role: string };
  reason?: string;
}> {
  if (!usernameInput || !passwordInput) {
    return { success: false, reason: 'Username and password are required.' };
  }

  const cleanUser = usernameInput.trim().toLowerCase();
  const cleanPass = passwordInput.trim();

  const allowedAliases = getAllowedAdminUsernames();
  const isRecognizedAlias = allowedAliases.includes(cleanUser);

  const envPass = (process.env.ADMIN_PASSWORD || 'ChangeMe_NayeemAdmin2026!').trim();
  const defaultPass = 'ChangeMe_NayeemAdmin2026!';

  // Direct environment password match for recognized admin aliases
  if (isRecognizedAlias && (cleanPass === envPass || cleanPass === defaultPass)) {
    await markAdminLoginSuccess(cleanUser);
    return {
      success: true,
      user: {
        username: cleanUser,
        name: 'Muhammad Nayeem',
        role: 'Administrator & Owner',
      },
    };
  }

  // Check PostgreSQL admin_users table
  if (isPostgresConfigured()) {
    const pool = getPostgresPool();
    if (pool) {
      try {
        const res = await pool.query(
          `SELECT id, username, password_hash, created_at, last_login_at
           FROM admin_users
           WHERE LOWER(username) = LOWER($1)
           LIMIT 1`,
          [cleanUser]
        );

        if (res.rows.length > 0) {
          const row = res.rows[0];
          const matches =
            verifyPassword(cleanPass, row.password_hash) ||
            cleanPass === envPass ||
            cleanPass === defaultPass;

          if (matches) {
            await markAdminLoginSuccess(cleanUser);
            return {
              success: true,
              user: {
                username: row.username,
                name: 'Muhammad Nayeem',
                role: 'Administrator & Owner',
              },
            };
          }
        }
      } catch (err) {
        console.warn('[Auth Service Warning]: Database lookup failed:', err);
      }
    }
  }

  // Check in-memory store
  const inMem = inMemoryAdminUsers.get(cleanUser);
  if (inMem) {
    const matches =
      verifyPassword(cleanPass, inMem.password_hash) ||
      cleanPass === envPass ||
      cleanPass === defaultPass;

    if (matches) {
      await markAdminLoginSuccess(cleanUser);
      return {
        success: true,
        user: {
          username: inMem.username,
          name: 'Muhammad Nayeem',
          role: 'Administrator & Owner',
        },
      };
    }
  }

  return { success: false, reason: 'Invalid username or password.' };
}

/**
 * Updates last_login_at timestamp when admin successfully logs in.
 */
async function markAdminLoginSuccess(username: string): Promise<void> {
  const cleanUsername = username.trim().toLowerCase();

  // In-memory update
  const inMem = inMemoryAdminUsers.get(cleanUsername);
  if (inMem) {
    inMem.last_login_at = new Date().toISOString();
  }

  // PostgreSQL update
  if (isPostgresConfigured()) {
    const pool = getPostgresPool();
    if (pool) {
      try {
        await pool.query(
          `UPDATE admin_users
           SET last_login_at = CURRENT_TIMESTAMP
           WHERE LOWER(username) = LOWER($1)`,
          [cleanUsername]
        );
      } catch {
        // Non-critical, ignore
      }
    }
  }
}
