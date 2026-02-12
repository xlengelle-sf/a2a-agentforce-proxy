/**
 * Dashboard cookie-based authentication.
 *
 * Uses HMAC-signed JSON tokens stored in HttpOnly cookies.
 * No additional dependencies — uses Node.js built-in crypto.
 *
 * Cookie-based auth is required because the browser EventSource API
 * cannot send custom Authorization headers.
 */

import { createHmac } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../shared/logger.js';
import { safeCompare } from '../shared/security.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const COOKIE_NAME = 'dashboard_session';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function getDashboardUser(): string {
  return process.env.DASHBOARD_USER ?? 'xlengelle';
}

function getDashboardPass(): string {
  return process.env.DASHBOARD_PASS ?? 'Kyx39vn7';
}

function getCookieSecret(): string {
  return process.env.DASHBOARD_COOKIE_SECRET ?? process.env.API_KEY ?? 'dev-cookie-secret';
}

// ─── Token Signing ──────────────────────────────────────────────────────────

interface SessionToken {
  user: string;
  exp: number; // Unix timestamp (ms)
}

function signToken(payload: SessionToken): string {
  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString('base64url');
  const signature = createHmac('sha256', getCookieSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyToken(token: string): SessionToken | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;

  // Verify signature
  const expectedSignature = createHmac('sha256', getCookieSecret())
    .update(encoded)
    .digest('base64url');

  if (!safeCompare(signature, expectedSignature)) {
    return null;
  }

  // Decode payload
  try {
    const data = Buffer.from(encoded, 'base64url').toString('utf-8');
    const payload = JSON.parse(data) as SessionToken;

    // Check expiry
    if (Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ─── Cookie Parsing ─────────────────────────────────────────────────────────

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name) {
      cookies[name.trim()] = rest.join('=').trim();
    }
  }
  return cookies;
}

// ─── Handlers ───────────────────────────────────────────────────────────────

/**
 * Handle POST /dashboard/login
 *
 * Accepts form-urlencoded or JSON body with { username, password }.
 */
export function handleLogin(req: Request, res: Response): void {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'Missing username or password' });
    return;
  }

  const validUser = getDashboardUser();
  const validPass = getDashboardPass();

  if (!safeCompare(username, validUser) || !safeCompare(password, validPass)) {
    logger.warn({ username }, 'Dashboard login failed');
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Create signed session token
  const token = signToken({
    user: username,
    exp: Date.now() + SESSION_DURATION_MS,
  });

  const isProduction = process.env.NODE_ENV === 'production';

  // Set cookie
  const cookieParts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}`,
  ];

  if (isProduction) {
    cookieParts.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));

  logger.info({ username }, 'Dashboard login successful');
  res.json({ success: true, redirect: '/dashboard' });
}

/**
 * Handle POST /dashboard/logout
 */
export function handleLogout(_req: Request, res: Response): void {
  // Clear cookie by setting it to empty with Max-Age=0
  const cookieParts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];

  res.setHeader('Set-Cookie', cookieParts.join('; '));
  res.json({ success: true, redirect: '/dashboard/login' });
}

/**
 * Middleware: require valid dashboard session cookie.
 * Redirects to login for HTML requests, returns 401 for API/SSE.
 */
export function dashboardAuth(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];

  if (!token) {
    return denyAccess(req, res);
  }

  const session = verifyToken(token);
  if (!session) {
    return denyAccess(req, res);
  }

  // Attach user to request for downstream handlers
  (req as Request & { dashboardUser?: string }).dashboardUser = session.user;
  next();
}

function denyAccess(req: Request, res: Response): void {
  const acceptsHtml = req.headers.accept?.includes('text/html');
  const isApiOrSSE = req.path.startsWith('/dashboard/api') || req.path === '/dashboard/events';

  if (isApiOrSSE || !acceptsHtml) {
    res.status(401).json({ error: 'Authentication required' });
  } else {
    res.redirect('/dashboard/login');
  }
}

// ─── Exports for testing ────────────────────────────────────────────────────

export { signToken as _signToken, verifyToken as _verifyToken, parseCookies as _parseCookies };
