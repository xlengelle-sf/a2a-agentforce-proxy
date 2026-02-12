import { logger } from '../shared/logger.js';

const REQUIRED_VARS = [
  'SALESFORCE_SERVER_URL',
  'SALESFORCE_CLIENT_ID',
  'SALESFORCE_CLIENT_SECRET',
  'SALESFORCE_AGENT_ID',
  'SALESFORCE_CLIENT_EMAIL',
  'API_KEY',
  'DELEGATE_API_KEY',
];

export function validateEnv(): void {
  const missing: string[] = [];

  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    logger.error(
      { missing },
      `Missing required environment variables: ${missing.join(', ')}`
    );
    process.exit(1);
  }

  logger.info('Environment validation passed');
}
