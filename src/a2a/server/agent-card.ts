import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';
import { getConfig } from '../../config/config-manager.js';
import type { AgentCard } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedCard: AgentCard | null = null;

function loadAgentCard(): AgentCard {
  if (cachedCard) return cachedCard;

  const configPath = resolve(__dirname, '../../../config/agent-card.json');
  const raw = readFileSync(configPath, 'utf-8');

  const config = getConfig();
  const interpolated = raw.replace(/\$\{BASE_URL\}/g, config.baseUrl);

  cachedCard = JSON.parse(interpolated) as AgentCard;
  return cachedCard;
}

/** Reset the cache (for testing). */
export function resetAgentCardCache(): void {
  cachedCard = null;
}

/** GET /.well-known/agent-card.json — no authentication required. */
export function agentCardHandler(_req: Request, res: Response): void {
  const card = loadAgentCard();
  res.json(card);
}
