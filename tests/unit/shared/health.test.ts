import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { setRedisStatus } from '../../../src/shared/health.js';

describe('Enhanced Health Check', () => {
  afterEach(() => {
    // Reset to default
    setRedisStatus('not configured');
  });

  it('should return status ok with memory and redis info', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBeDefined();
    expect(res.body.uptime).toBeTypeOf('number');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.memory).toBeDefined();
    expect(res.body.memory.rss).toBeTypeOf('number');
    expect(res.body.memory.heapUsed).toBeTypeOf('number');
    expect(res.body.memory.heapTotal).toBeTypeOf('number');
    expect(res.body.redis).toBe('not configured');
  });

  it('should report redis as connected when set', async () => {
    setRedisStatus('connected');
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.body.redis).toBe('connected');
  });

  it('should report redis as disconnected when set', async () => {
    setRedisStatus('disconnected');
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.body.redis).toBe('disconnected');
  });
});
