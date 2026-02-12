import { logger } from '../shared/logger.js';

/** Env vars needed for the A2A proxy to function. */
const PROXY_REQUIRED_VARS = [
  'SALESFORCE_SERVER_URL',
  'SALESFORCE_CLIENT_ID',
  'SALESFORCE_CLIENT_SECRET',
  'SALESFORCE_AGENT_ID',
  'SALESFORCE_CLIENT_EMAIL',
];

/** Env vars the server always needs to start. */
const SERVER_REQUIRED_VARS = [
  'API_KEY',
  'DELEGATE_API_KEY',
];

/**
 * Validate environment variables.
 *
 * Server-level vars (API_KEY, DELEGATE_API_KEY) are **fatal** if missing.
 * Salesforce vars are **warned** — the server starts but the proxy won't
 * work until they're configured (the Setup Wizard helps with this).
 */
export function validateEnv(): void {
  // Check server-level vars (fatal)
  const serverMissing: string[] = [];
  for (const varName of SERVER_REQUIRED_VARS) {
    if (!process.env[varName]) {
      serverMissing.push(varName);
    }
  }

  if (serverMissing.length > 0) {
    logger.error(
      { missing: serverMissing },
      `Missing required server environment variables: ${serverMissing.join(', ')}`,
    );
    process.exit(1);
  }

  // Check Salesforce vars (warn only — dashboard + wizard still usable)
  const sfMissing: string[] = [];
  for (const varName of PROXY_REQUIRED_VARS) {
    if (!process.env[varName]) {
      sfMissing.push(varName);
    }
  }

  if (sfMissing.length > 0) {
    logger.warn(
      { missing: sfMissing },
      `Salesforce env vars not yet configured: ${sfMissing.join(', ')}. ` +
        'A2A proxy is disabled. Use the Setup Wizard at /dashboard to configure.',
    );
  } else {
    logger.info('Environment validation passed — all variables configured');
  }
}
