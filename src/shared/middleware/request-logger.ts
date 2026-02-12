import pinoHttpModule from 'pino-http';
import { logger } from '../logger.js';

// pino-http has a .default property at runtime in ESM
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pinoHttp = (pinoHttpModule as any).default ?? pinoHttpModule;

export const requestLogger = pinoHttp({ logger });
