import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

// Secret key for signing sessions
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.ADMIN_PASSWORD ||
  'nayeem-ai-desk-master-session-key-2026';

// In-memory active tokens and revoked tokens
const activeSessions = new Set<string>();
const revokedTokens = new Set<string>();

// Rate limiter records
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimiter(limit = 60, windowMs = 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= limit) {
      return res.status(429).json({
        error: 'Too many requests. Please slow down.',
      });
    }

    record.count++;
    next();
  };
}

export function createAdminToken(username = 'nayeem'): string {
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now().toString();
  const payload = `${username}:${timestamp}:${randomBytes}`;
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  const token = `${payload}:${signature}`;

  activeSessions.add(token);
  return token;
}

export function verifyAdminToken(token?: string): boolean {
  if (!token || typeof token !== 'string') return false;
  if (revokedTokens.has(token)) return false;

  // Verify HMAC-signed token
  const parts = token.split(':');
  if (parts.length === 4) {
    const [username, timestamp, randomBytes, signature] = parts;
    const payload = `${username}:${timestamp}:${randomBytes}`;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

    if (
      signature.length === expectedSig.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
    ) {
      // Valid for 7 days
      const createdTime = parseInt(timestamp, 10);
      const now = Date.now();
      const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
      if (!isNaN(createdTime) && now - createdTime <= maxAgeMs) {
        return true;
      }
    }
  }

  // Also check in-memory set for backward compatibility
  return activeSessions.has(token);
}

export function revokeAdminToken(token?: string): void {
  if (token) {
    activeSessions.delete(token);
    revokedTokens.add(token);
  }
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized: Admin authentication token required.',
    });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!verifyAdminToken(token)) {
    return res.status(401).json({
      error: 'Unauthorized: Session expired or invalid token.',
    });
  }

  next();
}
