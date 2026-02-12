# Dashboard Specifications

## 1. Overview

The web dashboard provides two core capabilities:
1. **Agent Conversation Monitor** — Real-time visualization of messages exchanged between Agentforce and external A2A agents
2. **Salesforce Setup Wizard** — Guided configuration flow with automated verification where possible

## 2. Authentication

- Simple fixed-credential login (prototype)
- Credentials configurable via env vars: `DASHBOARD_USER` / `DASHBOARD_PASS`
- Cookie-based session (required because SSE `EventSource` cannot send custom headers)
- Cookie: `HttpOnly`, `SameSite=Strict`, `Secure` (in production)
- Token: HMAC-signed JSON `{ user, exp }` using `DASHBOARD_COOKIE_SECRET` (falls back to `API_KEY`)
- Session expiry: 24 hours
- Completely separate from API authentication (`Bearer` / `X-API-Key`)

## 3. Conversation Monitor

### 3.1 Data Model

```typescript
interface ConversationEvent {
  id: string;           // UUID
  timestamp: string;    // ISO-8601
  direction: 'inbound' | 'outbound';
  source: string;       // Agent name (e.g., "External A2A Agent", "Agentforce")
  target: string;       // Agent name
  taskId: string;
  contextId: string;
  messageType: 'request' | 'response' | 'error' | 'stream-chunk' | 'status';
  content: string;      // Message text
  latencyMs?: number;   // Response latency (on response events only)
  metadata?: Record<string, unknown>;
}
```

### 3.2 Event Capture

Three hook points in existing handlers:
- **Inbound A2A → Agentforce** (`jsonrpc-handler.ts`): request + response events
- **Inbound streaming** (`streaming.ts`): request + stream chunks + final status
- **Outbound Agentforce → A2A** (`delegate.ts`): request + response events

### 3.3 Event Storage

- Ring buffer with configurable capacity (default: 500)
- Auto-subscribes to `ConversationEventBus`
- Oldest events evicted when buffer is full
- In-memory only — cleared on dyno restart

### 3.4 Real-time Delivery

- SSE endpoint: `GET /dashboard/events`
- On connect: send full history as `history` event
- Live events: forward as `conversation` SSE events
- Heartbeat: `:heartbeat\n\n` every 15 seconds (reuse existing `startHeartbeat()`)

### 3.5 UI Design

- iMessage-style chat bubbles
  - Left-aligned (blue) for inbound requests / outbound responses
  - Right-aligned (green) for outbound requests / inbound responses
  - Agent name label above each bubble
  - Timestamp below each bubble
  - Latency badge on response messages
- Grouped by `contextId` (collapsible conversation threads)
- Status indicators: colored dots (green/yellow/red)
- Auto-scroll with "scroll to bottom" button
- Connection status indicator (connected/reconnecting/disconnected)
- Empty state placeholder

## 4. Setup Wizard

### 4.1 Automated Steps

| Endpoint | Input | Action |
|---|---|---|
| `POST /dashboard/api/setup/test-oauth` | serverUrl, clientId, clientSecret, clientEmail | Creates temp `AgentforceAuth`, calls `getToken()` |
| `POST /dashboard/api/setup/discover-agents` | serverUrl, accessToken | SOQL: `SELECT Id, DeveloperName, MasterLabel FROM BotDefinition` |
| `POST /dashboard/api/setup/test-session` | serverUrl, accessToken, agentId | Creates + immediately deletes session |
| `POST /dashboard/api/setup/test-message` | serverUrl, accessToken, agentId | Creates session, sends test message, returns response |
| `GET /dashboard/api/setup/verify-proxy` | — | Returns health + config status (no secrets exposed) |

### 4.2 Wizard Steps

1. **Welcome** — Overview + prerequisites checklist
2. **Connected App** — Manual Salesforce UI instructions + checklist
3. **OAuth Credentials** — Form + automated test
4. **Agent Selection** — Automated discovery + selection
5. **Agent Test** — Automated session + message test
6. **Proxy Configuration** — Env var commands + verification
7. **Outbound Setup** — Manual instructions for Named Credential, External Service, Agent Action
8. **Complete** — Summary + quick-test commands

### 4.3 Wizard Constraints

- OAuth test must pass before agent discovery is enabled
- Agent discovery requires valid access token from OAuth test
- Test message requires selected agent from discovery
- Steps can be revisited (state persists in browser)
- Credentials entered in wizard are NOT stored server-side (only used for one-time testing)

## 5. Security Considerations

- Dashboard credentials are prototype-only — not suitable for production multi-user access
- Wizard API endpoints are protected by same cookie auth as dashboard
- Credentials entered in setup wizard are used transiently (not persisted)
- No secrets exposed in `verify-proxy` response (only boolean `isSet` flags)
- Rate limiting not applied to dashboard (separate from API rate limiters)
