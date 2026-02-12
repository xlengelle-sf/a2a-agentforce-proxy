import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../../config/config-manager.js';
import { safeCompare } from '../security.js';

/**
 * Bearer token authentication middleware.
 * Validates the Authorization header against the configured API_KEY.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7); // strip "Bearer "
  const config = getConfig();

  if (!config.apiKey || !safeCompare(token, config.apiKey)) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  next();
}
