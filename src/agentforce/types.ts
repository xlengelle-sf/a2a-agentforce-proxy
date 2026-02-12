// ─── OAuth ───────────────────────────────────────────────────────────────────

export interface OAuthTokenResponse {
  access_token: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
  signature: string;
}

export interface CachedToken {
  accessToken: string;
  instanceUrl: string;
  expiresAt: number; // epoch ms
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface AgentforceSessionRequest {
  externalSessionKey: string;
  instanceConfig: { endpoint: string };
  streamingCapabilities: { chunkTypes: string[] };
  bypassUser: boolean;
}

export interface AgentforceSessionResponse {
  sessionId: string;
}

// ─── Messaging ───────────────────────────────────────────────────────────────

export interface AgentforceMessageRequest {
  message: {
    sequenceId: number;
    type: 'Text';
    text: string;
  };
}

export interface AgentforceMessageItem {
  id: string;
  type: string;
  message: string;
  feedbackId?: string;
  planId?: string;
}

export interface AgentforceMessageResponse {
  messages: AgentforceMessageItem[];
}

// ─── Streaming ──────────────────────────────────────────────────────────────

export type AgentforceStreamEvent =
  | { type: 'ProgressIndicator'; data: { text?: string } }
  | { type: 'TextChunk'; data: { text: string } }
  | { type: 'Inform'; data: { message: string; citedReferences?: unknown[] } }
  | { type: 'EndOfTurn'; data: Record<string, unknown> }
  | { type: 'ValidationFailureChunk'; data: { message: string } };

// ─── Client Config ──────────────────────────────────────────────────────────

export interface AgentforceClientConfig {
  serverUrl: string;
  clientId: string;
  clientSecret: string;
  clientEmail: string;
  agentId: string;
  /** Token TTL in ms (default: 55 min — conservative vs 60 min SF expiry) */
  tokenTtlMs?: number;
  /** Message timeout in ms (default: 120 000) */
  messageTimeoutMs?: number;
}
