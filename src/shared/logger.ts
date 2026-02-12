import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(isDev
    ? {
        transport: {
          target: 'pino/file',
          options: { destination: 1 }, // stdout
        },
      }
    : {}),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      '*.access_token',
      '*.client_secret',
      '*.authToken',
    ],
    censor: '[REDACTED]',
  },
});
