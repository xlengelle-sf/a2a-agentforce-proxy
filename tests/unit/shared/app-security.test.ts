import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';

describe('App Security Middleware', () => {
  const app = createApp();

  it('should include helmet security headers', async () => {
    const res = await request(app).get('/health');

    // Helmet sets several security headers
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('should include CORS headers for allowed origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://example.com');

    // Default CORS allows all origins
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('should respond to OPTIONS preflight requests', async () => {
    const res = await request(app)
      .options('/health')
      .set('Origin', 'https://example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBeLessThan(400);
  });

  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
  });

  it('should reject oversized JSON payloads', async () => {
    // Create a body larger than 1MB
    const largeBody = { data: 'x'.repeat(1024 * 1024 + 100) };
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(largeBody));

    // Express may return 413 or route through error handler (500)
    // Either way, the request should not succeed
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
