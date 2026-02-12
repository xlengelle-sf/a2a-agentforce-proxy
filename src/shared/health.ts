import type { Request, Response } from 'express';

const startTime = Date.now();

/** Optional Redis client reference for health check */
let redisStatus: 'connected' | 'disconnected' | 'not configured' = 'not configured';

/**
 * Set the Redis connectivity status for health checks.
 * Called by index.ts after Redis is initialized.
 */
export function setRedisStatus(status: 'connected' | 'disconnected' | 'not configured'): void {
  redisStatus = status;
}

/**
 * Enhanced health check handler.
 * Returns server status, uptime, memory usage, and Redis connectivity.
 */
export function healthHandler(_req: Request, res: Response): void {
  const mem = process.memoryUsage();

  res.json({
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    redis: redisStatus,
  });
}
