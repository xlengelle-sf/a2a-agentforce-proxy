import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import {
  handleLogin,
  handleLogout,
  dashboardAuth,
  _signToken,
  _verifyToken,
  _parseCookies,
} from '../../../src/dashboard/auth.js';

describe('Dashboard Auth', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DASHBOARD_USER = 'testuser';
    process.env.DASHBOARD_PASS = 'testpass';
    process.env.API_KEY = 'test-api-key-for-cookie-signing';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ─── Token signing/verification ─────────────────────────────────────

  describe('signToken / verifyToken', () => {
    it('should sign and verify a valid token', () => {
      const token = _signToken({ user: 'alice', exp: Date.now() + 60_000 });
      const payload = _verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.user).toBe('alice');
    });

    it('should reject expired tokens', () => {
      const token = _signToken({ user: 'alice', exp: Date.now() - 1000 });
      const payload = _verifyToken(token);

      expect(payload).toBeNull();
    });

    it('should reject tampered tokens', () => {
      const token = _signToken({ user: 'alice', exp: Date.now() + 60_000 });
      const tampered = token.slice(0, -1) + 'X';
      const payload = _verifyToken(tampered);

      expect(payload).toBeNull();
    });

    it('should reject malformed tokens', () => {
      expect(_verifyToken('')).toBeNull();
      expect(_verifyToken('just-one-part')).toBeNull();
      expect(_verifyToken('a.b.c')).toBeNull();
    });
  });

  // ─── Cookie parsing ─────────────────────────────────────────────────

  describe('parseCookies', () => {
    it('should parse cookie header', () => {
      const cookies = _parseCookies('name=value; other=thing');
      expect(cookies.name).toBe('value');
      expect(cookies.other).toBe('thing');
    });

    it('should handle empty input', () => {
      expect(_parseCookies(undefined)).toEqual({});
      expect(_parseCookies('')).toEqual({});
    });

    it('should handle cookies with = in value', () => {
      const cookies = _parseCookies('token=abc.def=ghi');
      expect(cookies.token).toBe('abc.def=ghi');
    });
  });

  // ─── Login handler ─────────────────────────────────────────────────

  describe('handleLogin', () => {
    function createLoginApp() {
      const app = express();
      app.use(express.json());
      app.post('/login', handleLogin);
      return app;
    }

    it('should return 200 and set cookie on valid credentials', async () => {
      const app = createLoginApp();
      const res = await request(app)
        .post('/login')
        .send({ username: 'testuser', password: 'testpass' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.redirect).toBe('/dashboard');
      expect(res.headers['set-cookie']).toBeDefined();

      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toContain('dashboard_session=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
    });

    it('should return 401 on invalid credentials', async () => {
      const app = createLoginApp();
      const res = await request(app)
        .post('/login')
        .send({ username: 'wrong', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 400 on missing fields', async () => {
      const app = createLoginApp();

      const res1 = await request(app).post('/login').send({ username: 'testuser' });
      expect(res1.status).toBe(400);

      const res2 = await request(app).post('/login').send({ password: 'testpass' });
      expect(res2.status).toBe(400);
    });

    it('should not set Secure flag in development', async () => {
      process.env.NODE_ENV = 'development';
      const app = createLoginApp();
      const res = await request(app)
        .post('/login')
        .send({ username: 'testuser', password: 'testpass' });

      const cookie = res.headers['set-cookie'][0];
      expect(cookie).not.toContain('Secure');
    });
  });

  // ─── Logout handler ─────────────────────────────────────────────────

  describe('handleLogout', () => {
    it('should clear the cookie', async () => {
      const app = express();
      app.post('/logout', handleLogout);
      const res = await request(app).post('/logout');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toContain('dashboard_session=');
      expect(cookie).toContain('Max-Age=0');
    });
  });

  // ─── Auth middleware ────────────────────────────────────────────────

  describe('dashboardAuth middleware', () => {
    function createProtectedApp() {
      const app = express();
      app.use(express.json());

      // Login route to get a cookie
      app.post('/login', handleLogin);

      // Protected route
      app.get('/protected', dashboardAuth, (_req, res) => {
        res.json({ message: 'secret data' });
      });

      // Protected API route
      app.get('/api/data', dashboardAuth, (_req, res) => {
        res.json({ data: 'api data' });
      });

      return app;
    }

    it('should allow access with valid cookie', async () => {
      const app = createProtectedApp();

      // Login first
      const loginRes = await request(app)
        .post('/login')
        .send({ username: 'testuser', password: 'testpass' });

      const cookie = loginRes.headers['set-cookie'][0];

      // Access protected route with cookie
      const res = await request(app)
        .get('/protected')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('secret data');
    });

    it('should return 401 for API requests without cookie', async () => {
      const app = createProtectedApp();
      const res = await request(app)
        .get('/api/data')
        .set('Accept', 'application/json');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    it('should redirect HTML requests to login', async () => {
      const app = createProtectedApp();
      const res = await request(app)
        .get('/protected')
        .set('Accept', 'text/html');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/dashboard/login');
    });

    it('should reject requests with invalid cookie', async () => {
      const app = createProtectedApp();
      const res = await request(app)
        .get('/api/data')
        .set('Cookie', 'dashboard_session=invalid-token');

      expect(res.status).toBe(401);
    });
  });
});
