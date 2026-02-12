import { describe, it, expect, beforeEach } from 'vitest';
import { getConfig, resetConfig } from '../../src/config/config-manager.js';

describe('Config Manager', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('reads config from environment variables', () => {
    process.env.SALESFORCE_SERVER_URL = 'test.salesforce.com';
    process.env.SALESFORCE_CLIENT_ID = 'cid';
    process.env.SALESFORCE_CLIENT_SECRET = 'csecret';
    process.env.SALESFORCE_AGENT_ID = 'aid';
    process.env.SALESFORCE_CLIENT_EMAIL = 'a@b.com';
    process.env.API_KEY = 'ak';
    process.env.DELEGATE_API_KEY = 'dk';
    process.env.PORT = '4000';

    const config = getConfig();
    expect(config.salesforce.serverUrl).toBe('test.salesforce.com');
    expect(config.salesforce.clientId).toBe('cid');
    expect(config.port).toBe(4000);
    expect(config.apiKey).toBe('ak');
  });

  it('returns cached config on second call', () => {
    const first = getConfig();
    const second = getConfig();
    expect(first).toBe(second);
  });

  it('resets cache with resetConfig', () => {
    const first = getConfig();
    resetConfig();
    process.env.PORT = '5000';
    const second = getConfig();
    expect(second.port).toBe(5000);
    expect(first).not.toBe(second);
  });
});
