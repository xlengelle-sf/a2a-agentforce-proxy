import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../shared/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExternalAgentConfig {
  alias: string;
  url: string;
  description?: string;
  authType: 'bearer' | 'apiKey' | 'none';
  authToken?: string;     // value or "ENV:VAR_NAME"
  authHeader?: string;    // for apiKey type (e.g. "X-API-Key")
}

interface AgentRegistryFile {
  agents: ExternalAgentConfig[];
}

// ─── Registry ───────────────────────────────────────────────────────────────

export class AgentRegistry {
  private agents: Map<string, ExternalAgentConfig> = new Map();

  constructor(configPath?: string) {
    const resolvedPath = configPath ?? this.defaultConfigPath();
    this.load(resolvedPath);
  }

  /** Get an agent by alias. */
  getAgent(alias: string): ExternalAgentConfig | null {
    return this.agents.get(alias) ?? null;
  }

  /** List all registered agents. */
  listAgents(): ExternalAgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Resolve the auth token for an agent.
   * If the token starts with "ENV:", read from environment variable.
   * Returns null if no token is configured or env var is missing.
   */
  resolveAuthToken(agent: ExternalAgentConfig): string | null {
    if (!agent.authToken) return null;

    if (agent.authToken.startsWith('ENV:')) {
      const envVar = agent.authToken.slice(4);
      const value = process.env[envVar];
      if (!value) {
        logger.warn({ alias: agent.alias, envVar }, 'Auth token env var not set');
        return null;
      }
      return value;
    }

    return agent.authToken;
  }

  /**
   * Build the auth headers for an outbound request to the given agent.
   */
  buildAuthHeaders(agent: ExternalAgentConfig): Record<string, string> {
    const token = this.resolveAuthToken(agent);
    if (!token) return {};

    switch (agent.authType) {
      case 'bearer':
        return { Authorization: `Bearer ${token}` };
      case 'apiKey':
        return { [agent.authHeader ?? 'X-API-Key']: token };
      case 'none':
      default:
        return {};
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private load(configPath: string): void {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed: AgentRegistryFile = JSON.parse(raw);

      for (const agent of parsed.agents) {
        this.agents.set(agent.alias, agent);
      }

      logger.info(
        { count: this.agents.size, path: configPath },
        'External agents registry loaded',
      );
    } catch (err) {
      logger.warn({ err, configPath }, 'Could not load external agents registry — starting with empty registry');
    }
  }

  private defaultConfigPath(): string {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return resolve(__dirname, '../../config/external-agents.json');
  }
}
