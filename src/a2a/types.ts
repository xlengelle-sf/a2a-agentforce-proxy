// ─── A2A Protocol v0.3 Types ──────────────────────────────────────────────────
// Defined locally to avoid tight coupling to @a2a-js/sdk version.

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected';

// ── Parts ────────────────────────────────────────────────────────────────────

export interface TextPart {
  type: 'text';
  text: string;
}

export interface DataPart {
  type: 'data';
  data: Record<string, unknown>;
}

export interface FilePart {
  type: 'file';
  file: {
    name?: string;
    mimeType?: string;
    bytes?: string; // base64
    uri?: string;
  };
}

export type Part = TextPart | DataPart | FilePart;

// ── Messages ─────────────────────────────────────────────────────────────────

export interface A2AMessage {
  role: 'user' | 'agent';
  parts: Part[];
  messageId?: string;
}

// ── Artifacts ────────────────────────────────────────────────────────────────

export interface A2AArtifact {
  name?: string;
  description?: string;
  parts: Part[];
  index: number;
}

// ── Task ─────────────────────────────────────────────────────────────────────

export interface A2ATaskStatus {
  state: TaskState;
  message?: A2AMessage;
  timestamp: string;
}

export interface A2ATask {
  id: string;
  contextId: string;
  status: A2ATaskStatus;
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
}

// ── JSON-RPC 2.0 ─────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// ── Send Task Params ─────────────────────────────────────────────────────────

export interface SendTaskParams {
  id?: string;
  contextId?: string;
  message: A2AMessage;
  historyLength?: number;
}

export interface GetTaskParams {
  id: string;
  historyLength?: number;
}

export interface CancelTaskParams {
  id: string;
}

// ── Streaming SSE Events ─────────────────────────────────────────────────────

export interface TaskStatusUpdateEvent {
  id: string;
  status: A2ATaskStatus;
  final: boolean;
}

export interface TaskArtifactUpdateEvent {
  id: string;
  artifact: {
    parts: Part[];
    index: number;
    append?: boolean;
    lastChunk?: boolean;
  };
}

export type A2AStreamEvent =
  | { type: 'status'; data: TaskStatusUpdateEvent }
  | { type: 'artifact'; data: TaskArtifactUpdateEvent };

// ── Agent Card ───────────────────────────────────────────────────────────────

export interface AgentCardSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  provider?: { organization: string; url?: string };
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory?: boolean;
  };
  authentication: {
    schemes: string[];
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentCardSkill[];
}
