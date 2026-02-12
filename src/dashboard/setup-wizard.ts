/**
 * Setup Wizard API handlers.
 *
 * Provides automated verification steps for Salesforce Agentforce setup:
 *  - test-oauth: Validate OAuth client credentials
 *  - discover-agents: List available agents via SOQL
 *  - test-session: Create + delete a test session
 *  - test-message: Send a test message and return the response
 *  - verify-proxy: Health check + configuration status
 */

import type { Request, Response } from 'express';
import { AgentforceAuth } from '../agentforce/client/auth.js';
import { AgentforceSession } from '../agentforce/client/session.js';
import { AgentforceMessaging } from '../agentforce/client/messaging.js';
import { logger } from '../shared/logger.js';

// ─── Test OAuth ──────────────────────────────────────────────────────────────

interface TestOAuthBody {
  serverUrl?: string;
  clientId?: string;
  clientSecret?: string;
  clientEmail?: string;
}

export async function handleTestOAuth(req: Request, res: Response): Promise<void> {
  const { serverUrl, clientId, clientSecret, clientEmail } = req.body as TestOAuthBody;

  if (!serverUrl || !clientId || !clientSecret || !clientEmail) {
    res.status(400).json({ error: 'Missing required fields: serverUrl, clientId, clientSecret, clientEmail' });
    return;
  }

  try {
    const startTime = Date.now();
    const auth = new AgentforceAuth({ serverUrl, clientId, clientSecret, clientEmail });
    const token = await auth.getToken();
    const latencyMs = Date.now() - startTime;

    res.json({
      success: true,
      instanceUrl: token.instanceUrl,
      latencyMs,
      message: 'OAuth authentication successful',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn({ err }, 'Setup wizard: OAuth test failed');
    res.json({
      success: false,
      error: message,
      message: 'OAuth authentication failed',
    });
  }
}

// ─── Discover Agents ─────────────────────────────────────────────────────────

interface DiscoverAgentsBody {
  serverUrl?: string;
  accessToken?: string;
}

export async function handleDiscoverAgents(req: Request, res: Response): Promise<void> {
  const { serverUrl, accessToken } = req.body as DiscoverAgentsBody;

  if (!serverUrl || !accessToken) {
    res.status(400).json({ error: 'Missing required fields: serverUrl, accessToken' });
    return;
  }

  try {
    const startTime = Date.now();
    const query = encodeURIComponent(
      "SELECT Id, DeveloperName, MasterLabel FROM BotDefinition WHERE IsActive = true ORDER BY MasterLabel ASC",
    );
    const url = `https://${serverUrl}/services/data/v62.0/query/?q=${query}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SOQL query failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      totalSize: number;
      records: Array<{ Id: string; DeveloperName: string; MasterLabel: string }>;
    };

    const latencyMs = Date.now() - startTime;

    res.json({
      success: true,
      agents: data.records.map((r) => ({
        id: r.Id,
        developerName: r.DeveloperName,
        label: r.MasterLabel,
      })),
      totalSize: data.totalSize,
      latencyMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn({ err }, 'Setup wizard: Agent discovery failed');
    res.json({ success: false, error: message, agents: [] });
  }
}

// ─── Test Session ────────────────────────────────────────────────────────────

interface TestSessionBody {
  accessToken?: string;
  instanceUrl?: string;
  agentId?: string;
}

export async function handleTestSession(req: Request, res: Response): Promise<void> {
  const { accessToken, instanceUrl, agentId } = req.body as TestSessionBody;

  if (!accessToken || !instanceUrl || !agentId) {
    res.status(400).json({ error: 'Missing required fields: accessToken, instanceUrl, agentId' });
    return;
  }

  try {
    const startTime = Date.now();
    const session = new AgentforceSession();

    // Create session
    const sessionId = await session.create(accessToken, instanceUrl, agentId);

    // Immediately delete it (cleanup)
    await session.delete(accessToken, sessionId);

    const latencyMs = Date.now() - startTime;

    res.json({
      success: true,
      sessionId,
      latencyMs,
      message: 'Session created and cleaned up successfully',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn({ err }, 'Setup wizard: Session test failed');
    res.json({ success: false, error: message, message: 'Session test failed' });
  }
}

// ─── Test Message ────────────────────────────────────────────────────────────

interface TestMessageBody {
  accessToken?: string;
  instanceUrl?: string;
  agentId?: string;
  testMessage?: string;
}

export async function handleTestMessage(req: Request, res: Response): Promise<void> {
  const { accessToken, instanceUrl, agentId, testMessage } = req.body as TestMessageBody;

  if (!accessToken || !instanceUrl || !agentId) {
    res.status(400).json({ error: 'Missing required fields: accessToken, instanceUrl, agentId' });
    return;
  }

  const text = testMessage ?? 'Hello, this is a test message from the A2A Proxy setup wizard.';

  try {
    const startTime = Date.now();
    const session = new AgentforceSession();
    const messaging = new AgentforceMessaging({ timeoutMs: 30_000 });

    // Create session
    const sessionId = await session.create(accessToken, instanceUrl, agentId);

    // Send test message
    const result = await messaging.send(accessToken, sessionId, 1, text);

    // Clean up session
    await session.delete(accessToken, sessionId).catch(() => {});

    const latencyMs = Date.now() - startTime;

    res.json({
      success: true,
      response: result.text,
      sessionId,
      latencyMs,
      message: 'Agent responded successfully',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn({ err }, 'Setup wizard: Message test failed');
    res.json({ success: false, error: message, message: 'Message test failed' });
  }
}

// ─── Verify Proxy ────────────────────────────────────────────────────────────

export function handleVerifyProxy(_req: Request, res: Response): void {
  const config = {
    salesforceServerUrl: maskValue(process.env.SALESFORCE_SERVER_URL),
    salesforceClientId: maskValue(process.env.SALESFORCE_CLIENT_ID),
    salesforceClientSecret: maskPresence(process.env.SALESFORCE_CLIENT_SECRET),
    salesforceAgentId: maskValue(process.env.SALESFORCE_AGENT_ID),
    salesforceClientEmail: maskValue(process.env.SALESFORCE_CLIENT_EMAIL),
    baseUrl: process.env.BASE_URL ?? 'not set',
    apiKey: maskPresence(process.env.API_KEY),
    delegateApiKey: maskPresence(process.env.DELEGATE_API_KEY),
    redisUrl: maskPresence(process.env.REDIS_URL ?? process.env.REDIS_TLS_URL),
    nodeEnv: process.env.NODE_ENV ?? 'not set',
  };

  const issues: string[] = [];

  if (!process.env.SALESFORCE_SERVER_URL) issues.push('SALESFORCE_SERVER_URL is not set');
  if (!process.env.SALESFORCE_CLIENT_ID) issues.push('SALESFORCE_CLIENT_ID is not set');
  if (!process.env.SALESFORCE_CLIENT_SECRET) issues.push('SALESFORCE_CLIENT_SECRET is not set');
  if (!process.env.SALESFORCE_AGENT_ID) issues.push('SALESFORCE_AGENT_ID is not set');
  if (!process.env.SALESFORCE_CLIENT_EMAIL) issues.push('SALESFORCE_CLIENT_EMAIL is not set');
  if (!process.env.BASE_URL) issues.push('BASE_URL is not set');
  if (!process.env.API_KEY) issues.push('API_KEY is not set');

  res.json({
    healthy: issues.length === 0,
    config,
    issues,
    timestamp: new Date().toISOString(),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Mask a value showing first 4 chars + "***" */
function maskValue(val: string | undefined): string {
  if (!val) return 'not set';
  if (val.length <= 6) return '***';
  return val.substring(0, 4) + '***';
}

/** Show only "set" or "not set" (for secrets) */
function maskPresence(val: string | undefined): string {
  return val ? 'set' : 'not set';
}
