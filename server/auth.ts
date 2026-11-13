import crypto from 'crypto';
import type express from 'express';
import { ADMIN_PASSWORD, SESSION_SECRET, TOKEN_TTL_MS } from './config.js';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest();

export function passwordMatches(input: unknown): boolean {
  if (!ADMIN_PASSWORD || typeof input !== 'string') return false;
  return crypto.timingSafeEqual(sha256(input), sha256(ADMIN_PASSWORD));
}

export function signToken(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS })).toString(
    'base64url'
  );
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

export const requireAdmin: express.RequestHandler = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (verifyToken(token)) return next();
  return res.status(401).json({ success: false, error: 'Потрібна авторизація адміністратора' });
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 10;
const loginFails = new Map<string, { count: number; resetAt: number }>();

export const handleLogin: express.RequestHandler = (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.json({ success: true, token: signToken(), passwordRequired: false });
  }

  const ip = req.ip || 'unknown';
  const now = Date.now();
  if (loginFails.size > 500) {
    for (const [k, v] of loginFails.entries()) {
      if (v.resetAt <= now) loginFails.delete(k);
    }
  }

  const entry = loginFails.get(ip);
  if (entry && entry.resetAt > now && entry.count >= LOGIN_MAX_FAILS) {
    return res.status(429).json({ success: false, error: 'Забагато спроб. Спробуйте пізніше.' });
  }

  const { password } = req.body || {};
  if (passwordMatches(password)) {
    loginFails.delete(ip);
    return res.json({ success: true, token: signToken() });
  }

  const fresh = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  fresh.count += 1;
  loginFails.set(ip, fresh);
  return res.status(401).json({ success: false, error: 'Невірний пароль адміністратора' });
};

export function createIpRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message: string;
}): express.RequestHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();
    if (buckets.size > 1000) {
      for (const [k, v] of buckets.entries()) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }

    const ip = req.ip || 'unknown';
    const current = buckets.get(ip);
    if (!current || current.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (current.count >= options.maxRequests) {
      return res.status(429).json({ success: false, error: options.message });
    }

    current.count += 1;
    return next();
  };
}
