import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { AgentRegistry } from '../../../src/config/agent-registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = resolve(__dirname, '../../tmp');
const TMP_CONFIG = resolve(TMP_DIR, 'test-agents.json');

const SAMPLE_CONFIG = {
  agents: [
    {
      alias: 'weather-agent',
      url: 'https://weather.example.com',
      description: 'Weather forecasts',
      authType: 'bearer',
      authToken: 'ENV:WEATHER_TOKEN',
    },
    {
      alias: 'research-agent',
      url: 'https://research.example.com',
      description: 'Research helper',
      authType: 'apiKey',
      authHeader: 'X-API-Key',
      authToken: 'static-key-123',
    },
    {
      alias: 'open-agent',
      url: 'https://open.example.com',
      description: 'Open agent',
      authType: 'none',
    },
  ],
};

describe('AgentRegistry', () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(TMP_CONFIG, JSON.stringify(SAMPLE_CONFIG));
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should load agents from config file', () => {
    const registry = new AgentRegistry(TMP_CONFIG);
    const agents = registry.listAgents();
    expect(agents).toHaveLength(3);
  });

  it('should get an agent by alias', () => {
    const registry = new AgentRegistry(TMP_CONFIG);
    const agent = registry.getAgent('weather-agent');
    expect(agent).not.toBeNull();
    expect(agent!.url).toBe('https://weather.example.com');
    expect(agent!.authType).toBe('bearer');
  });

  it('should return null for unknown alias', () => {
    const registry = new AgentRegistry(TMP_CONFIG);
    expect(registry.getAgent('nonexistent')).toBeNull();
  });

  it('should resolve auth token from env var (ENV: prefix)', () => {
    process.env.WEATHER_TOKEN = 'secret-weather-key';

    const registry = new AgentRegistry(TMP_CONFIG);
    const agent = registry.getAgent('weather-agent')!;
    const token = registry.resolveAuthToken(agent);

    expect(token).toBe('secret-weather-key');

    delete process.env.WEATHER_TOKEN;
  });

  it('should return null when env var is not set', () => {
    delete process.env.WEATHER_TOKEN;

    const registry = new AgentRegistry(TMP_CONFIG);
    const agent = registry.getAgent('weather-agent')!;
    const token = registry.resolveAuthToken(agent);

    expect(token).toBeNull();
  });

  it('should return static token when not using ENV: prefix', () => {
    const registry = new AgentRegistry(TMP_CONFIG);
    const agent = registry.getAgent('research-agent')!;
    const token = registry.resolveAuthToken(agent);

    expect(token).toBe('static-key-123');
  });

  it('should return null token for authType=none agent', () => {
    const registry = new AgentRegistry(TMP_CONFIG);
    const agent = registry.getAgent('open-agent')!;
    const token = registry.resolveAuthToken(agent);

    expect(token).toBeNull();
  });

  it('should build bearer auth headers', () => {
    process.env.WEATHER_TOKEN = 'my-bearer-token';

    const registry = new AgentRegistry(TMP_CONFIG);
    const agent = registry.getAgent('weather-agent')!;
    const headers = registry.buildAuthHeaders(agent);

    expect(headers).toEqual({ Authorization: 'Bearer my-bearer-token' });

    delete process.env.WEATHER_TOKEN;
  });

  it('should build apiKey auth headers with custom header name', () => {
    const registry = new AgentRegistry(TMP_CONFIG);
    const agent = registry.getAgent('research-agent')!;
    const headers = registry.buildAuthHeaders(agent);

    expect(headers).toEqual({ 'X-API-Key': 'static-key-123' });
  });

  it('should build empty headers for authType=none', () => {
    const registry = new AgentRegistry(TMP_CONFIG);
    const agent = registry.getAgent('open-agent')!;
    const headers = registry.buildAuthHeaders(agent);

    expect(headers).toEqual({});
  });

  it('should handle missing config file gracefully', () => {
    const registry = new AgentRegistry('/nonexistent/path/agents.json');
    expect(registry.listAgents()).toHaveLength(0);
  });
});
