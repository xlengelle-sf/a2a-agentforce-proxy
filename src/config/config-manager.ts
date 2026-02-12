export interface AppConfig {
  // Salesforce / Agentforce
  salesforce: {
    serverUrl: string;
    clientId: string;
    clientSecret: string;
    agentId: string;
    clientEmail: string;
  };

  // Proxy
  baseUrl: string;
  apiKey: string;
  delegateApiKey: string;
  port: number;

  // Redis
  redisUrl: string | undefined;
  redisTlsUrl: string | undefined;

  // Behavior
  sessionTtlSeconds: number;
  logLevel: string;
  nodeEnv: string;
}

let config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (config) return config;

  config = {
    salesforce: {
      serverUrl: process.env.SALESFORCE_SERVER_URL ?? '',
      clientId: process.env.SALESFORCE_CLIENT_ID ?? '',
      clientSecret: process.env.SALESFORCE_CLIENT_SECRET ?? '',
      agentId: process.env.SALESFORCE_AGENT_ID ?? '',
      clientEmail: process.env.SALESFORCE_CLIENT_EMAIL ?? '',
    },
    baseUrl: process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`,
    apiKey: process.env.API_KEY ?? '',
    delegateApiKey: process.env.DELEGATE_API_KEY ?? '',
    port: parseInt(process.env.PORT ?? '3000', 10),
    redisUrl: process.env.REDIS_URL,
    redisTlsUrl: process.env.REDIS_TLS_URL,
    sessionTtlSeconds: parseInt(process.env.SESSION_TTL_SECONDS ?? '1800', 10),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };

  return config;
}

/** Reset config (for testing) */
export function resetConfig(): void {
  config = null;
}
