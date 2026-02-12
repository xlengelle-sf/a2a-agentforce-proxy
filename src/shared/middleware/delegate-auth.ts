import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../../config/config-manager.js';
import { safeCompare } from '../security.js';

/**
 * API Key authentication middleware for the delegate endpoint.
 * Checks the X-API-Key header against DELEGATE_API_KEY.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * Separate from bearerAuth so inbound A2A and outbound delegate
 * can use different keys.
 */
export function delegateAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return;
  }

  const config = getConfig();

  if (!config.delegateApiKey || !safeCompare(apiKey, config.delegateApiKey)) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  next();
}
