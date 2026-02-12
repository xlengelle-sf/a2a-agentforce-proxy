# A2A Proxy for Agentforce — Technical Specifications

## 1. Architecture

### 1.1 High-Level Architecture

```
                        INBOUND (A2A → Agentforce)
    +-----------+     +--------------------------------------------------+     +----------------+
    |  External |     |              HEROKU PROXY                        |     |   Salesforce    |
    |  A2A      | --> | A2A Server --> Translator --> Agentforce Client   | --> |   Agentforce    |
    |  Agent    | <-- |  (JSON-RPC)     Layer         (REST + OAuth)      | <-- |   Agent API     |
    +-----------+     |                                                  |     +----------------+
                      |           Session Manager (Redis)                |
                      |           Config Manager                         |
    +-----------+     |                                                  |     +----------------+
    |  External |     | A2A Client  <-- Translator <-- Delegate Endpoint |     |   Salesforce    |
    |  A2A      | <-- |  (JSON-RPC)      Layer        (REST/OpenAPI)     | <-- |   Agentforce    |
    |  Agent    | --> |                                                  | --> |   Agent (Flow)  |
    +-----------+     +--------------------------------------------------+     +----------------+
                        OUTBOUND (Agentforce → A2A)
```

### 1.2 Component Diagram

```
src/
├── index.ts                    # Entry point
├── app.ts                      # Express app setup
│
├── a2a/                        # A2A protocol layer
│   ├── server/                 # Inbound: receives A2A requests
│   │   ├── agent-card.ts       # GET /.well-known/agent-card.json
│   │   ├── jsonrpc-handler.ts  # POST /a2a — JSON-RPC dispatcher
│   │   └── streaming.ts        # SSE streaming for A2A responses
│   ├── client/                 # Outbound: calls external A2A agents
│   │   ├── a2a-client.ts       # JSON-RPC client
│   │   └── agent-card-resolver.ts  # Fetch & cache Agent Cards
│   └── types.ts                # A2A protocol type definitions
│
├── agentforce/                 # Agentforce API layer
│   ├── client/                 # Calls Agentforce Agent API
│   │   ├── auth.ts             # OAuth 2.0 Client Credentials
│   │   ├── session.ts          # Create / delete sessions
│   │   ├── messaging.ts        # Send message (synchronous)
│   │   └── streaming.ts        # Send message (SSE streaming)
│   ├── action-endpoint/        # Called by Agentforce as External Service
│   │   └── delegate.ts         # POST /api/v1/delegate
│   └── types.ts                # Agentforce API type definitions
│
├── translation/                # Protocol conversion
│   ├── a2a-to-agentforce.ts    # A2A Message → Agentforce message
│   ├── agentforce-to-a2a.ts    # Agentforce response → A2A Task
│   ├── streaming-bridge.ts     # Bridge SSE event formats
│   └── error-mapper.ts         # Error code translation
│
├── session/                    # Session/Task state management
│   ├── session-manager.ts      # Orchestrates session lifecycle
│   ├── store.ts                # Abstract store interface
│   ├── memory-store.ts         # In-memory store (dev)
│   └── redis-store.ts          # Redis store (production)
│
├── config/                     # Configuration
│   ├── config-manager.ts       # Centralized config access
│   └── env-validator.ts        # Startup validation
│
└── shared/                     # Shared utilities
    ├── logger.ts               # Pino logger
    ├── errors.ts               # Custom error classes
    └── middleware/              # Express middleware
        ├── error-handler.ts    # Global error handler
        ├── auth.ts             # Request authentication
        └── request-logger.ts   # Request/response logging
```

---

## 2. Protocol Translation Details

### 2.1 A2A → Agentforce Message Translation

**Input**: A2A `Message` object
```json
{
  "role": "user",
  "parts": [
    { "type": "text", "text": "Find me a hotel near CDG airport" },
    { "type": "data", "data": { "budget": 150, "currency": "EUR" } }
  ],
  "messageId": "msg-123"
}
```

**Output**: Agentforce message payload
```json
{
  "message": {
    "sequenceId": 1,
    "type": "Text",
    "text": "Find me a hotel near CDG airport\n\n[Structured Data]\n{\"budget\":150,\"currency\":\"EUR\"}"
  }
}
```

**Translation Rules:**
1. Extract all `TextPart` content, concatenate with newlines
2. For `DataPart`: serialize as JSON, prefix with `[Structured Data]` marker
3. For `FilePart`: append `[File: {name}, type: {mimeType}]` — content not forwarded in MVP
4. The `sequenceId` is resolved from the Session Manager (not from the A2A message)

### 2.2 Agentforce → A2A Response Translation

**Input**: Agentforce response
```json
{
  "messages": [
    {
      "id": "msg-456",
      "type": "Text",
      "message": "I found 3 hotels near CDG airport...",
      "feedbackId": "fb-789",
      "planId": "plan-101"
    }
  ]
}
```

**Output**: A2A `Task` object
```json
{
  "id": "task-uuid",
  "contextId": "ctx-uuid",
  "status": {
    "state": "completed",
    "timestamp": "2026-02-12T10:00:00Z"
  },
  "artifacts": [
    {
      "name": "response",
      "parts": [
        { "type": "text", "text": "I found 3 hotels near CDG airport..." }
      ],
      "index": 0
    }
  ]
}
```

**Translation Rules:**
1. Extract `messages[0].message` as the response text
2. Create a single `Artifact` with a `TextPart`
3. Set task state based on response content:
   - Default: `completed`
   - If response appears to ask a question (heuristic): `input-required`
   - If error: `failed`
4. Preserve `contextId` from the original request

### 2.3 Streaming Event Translation

| Agentforce SSE Event | A2A SSE Event | Details |
|----------------------|---------------|---------|
| `ProgressIndicator` | `TaskStatusUpdateEvent` | `state: "working"`, `final: false` |
| `TextChunk` | `TaskArtifactUpdateEvent` | `artifact.parts[0].text = chunk`, `append: true` |
| `Inform` | `TaskArtifactUpdateEvent` | `artifact.parts[0].text = fullText`, `lastChunk: true` |
| `EndOfTurn` | `TaskStatusUpdateEvent` | `state: "completed"`, `final: true` |

---

## 3. Session Management

### 3.1 Data Model

```typescript
interface SessionMapping {
  // A2A identifiers
  a2aContextId: string;
  a2aTaskIds: string[];           // All task IDs in this context

  // Agentforce identifiers
  afSessionId: string;
  afSequenceId: number;           // Current sequence counter
  afAgentId: string;

  // Agentforce auth (per-tenant)
  tenantId: string;

  // Task state cache
  lastTaskState: TaskState;       // For tasks/get responses
  artifacts: Artifact[];

  // Lifecycle
  createdAt: number;              // Unix timestamp
  lastActivity: number;           // Unix timestamp
  state: 'active' | 'completed' | 'expired';
}
```

### 3.2 Session Store Interface

```typescript
interface SessionStore {
  get(contextId: string): Promise<SessionMapping | null>;
  set(contextId: string, session: SessionMapping): Promise<void>;
  update(contextId: string, updates: Partial<SessionMapping>): Promise<void>;
  delete(contextId: string): Promise<void>;
  getByTaskId(taskId: string): Promise<SessionMapping | null>;
  cleanup(maxAgeSec: number): Promise<number>; // Returns count of cleaned sessions
}
```

### 3.3 Redis Key Schema

```
session:{contextId}       → JSON(SessionMapping)     TTL: 1800s (30 min)
task:{taskId}             → contextId                 TTL: 1800s
token:{tenantId}          → JSON(OAuthToken)          TTL: token expiry
agentcard:{url-hash}      → JSON(AgentCard)           TTL: 300s (5 min)
```

---

## 4. Agentforce Client Details

### 4.1 OAuth 2.0 Client Credentials Flow

**Token Endpoint:** `https://{salesforce-domain}/services/oauth2/token`

**Request:**
```
POST /services/oauth2/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id={consumer_key}
&client_secret={consumer_secret}
```

**Note from existing code:** The Python client includes a `client_email` parameter in the token request. This is used when `bypassUser: true` is set in session creation and determines which Salesforce user context the agent runs as. This must be configurable per tenant.

**Response:**
```json
{
  "access_token": "00D...",
  "instance_url": "https://myorg.my.salesforce.com",
  "id": "https://login.salesforce.com/id/00D.../005...",
  "token_type": "Bearer",
  "issued_at": "1234567890",
  "signature": "..."
}
```

**Caching:** Token is cached per tenant. No explicit expiry in the response — implement a fixed TTL (e.g., 60 minutes) and refresh on 401 errors.

### 4.2 Session Creation

**Endpoint:** `POST https://api.salesforce.com/einstein/ai-agent/v1/agents/{agentId}/sessions`

**Request:**
```json
{
  "externalSessionKey": "{uuid}",
  "instanceConfig": {
    "endpoint": "{instance_url}"
  },
  "streamingCapabilities": {
    "chunkTypes": ["Text"]
  },
  "bypassUser": true
}
```

**Response:**
```json
{
  "sessionId": "session-uuid"
}
```

### 4.3 Send Message (Synchronous)

**Endpoint:** `POST https://api.salesforce.com/einstein/ai-agent/v1/sessions/{sessionId}/messages`

**Request:**
```json
{
  "message": {
    "sequenceId": 1,
    "type": "Text",
    "text": "user message here"
  }
}
```

**Timeout:** 120 seconds

**Response:**
```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "type": "Text",
      "message": "agent response here",
      "feedbackId": "fb-uuid",
      "planId": "plan-uuid"
    }
  ]
}
```

### 4.4 Send Message (Streaming)

**Endpoint:** `POST https://api.salesforce.com/einstein/ai-agent/v1/sessions/{sessionId}/messages/stream`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
Accept: text/event-stream
```

**SSE Event Types:**
- `ProgressIndicator` — agent is processing
- `TextChunk` — partial text response
- `Inform` — complete message (may include `citedReferences`)
- `EndOfTurn` — agent finished responding
- `ValidationFailureChunk` — validation error

**Note:** Exact SSE event payload structure needs to be confirmed by testing against a live Agentforce instance (see Risk Areas in 01-vision-and-overview.md).

---

## 5. A2A Client Details (Outbound)

### 5.1 Agent Card Resolution

1. Fetch `GET {agentUrl}/.well-known/agent-card.json`
2. Validate required fields (name, url, skills)
3. Cache with 5-minute TTL
4. Extract authentication requirements from `authentication.schemes`
5. Store the agent's JSON-RPC endpoint URL from `url` field

### 5.2 JSON-RPC Client

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "req-uuid",
  "method": "tasks/send",
  "params": {
    "id": "task-uuid",
    "message": {
      "role": "user",
      "parts": [{ "type": "text", "text": "user message" }]
    }
  }
}
```

**Response:** A2A `Task` object (see section 2.2 for structure)

---

## 6. Configuration

### 6.1 Environment Variables

```bash
# === Required: Salesforce / Agentforce ===
SALESFORCE_SERVER_URL=myorg.my.salesforce.com      # My Domain URL
SALESFORCE_CLIENT_ID=3MVG9...                       # Connected App Consumer Key
SALESFORCE_CLIENT_SECRET=210117...                  # Connected App Consumer Secret
SALESFORCE_AGENT_ID=0XxHn...                        # Agentforce Agent ID
SALESFORCE_CLIENT_EMAIL=agent@myorg.com             # Run-as user email

# === Required: Proxy ===
BASE_URL=https://my-proxy.herokuapp.com             # Public URL of this proxy
API_KEY=sk-...                                      # API key for inbound A2A auth
DELEGATE_API_KEY=dk-...                             # API key for outbound delegate endpoint
PORT=                                               # Set by Heroku

# === Optional: Redis ===
REDIS_URL=redis://...                               # Set by Heroku Redis add-on
REDIS_TLS_URL=rediss://...                          # TLS variant

# === Optional: Behavior ===
SESSION_TTL_SECONDS=1800                            # Session expiry (default: 30 min)
LOG_LEVEL=info                                      # pino log level
NODE_ENV=production
```

### 6.2 External Agents Registry

File: `config/external-agents.json`

```json
{
  "agents": [
    {
      "alias": "weather-agent",
      "url": "https://weather-agent.example.com",
      "description": "Provides weather forecasts worldwide",
      "authType": "bearer",
      "authToken": "ENV:WEATHER_AGENT_TOKEN"
    },
    {
      "alias": "research-agent",
      "url": "https://research.example.com",
      "description": "Performs web research and summarization",
      "authType": "apiKey",
      "authHeader": "X-API-Key",
      "authToken": "ENV:RESEARCH_AGENT_KEY"
    },
    {
      "alias": "open-agent",
      "url": "https://open-agent.example.com",
      "description": "An open agent with no auth",
      "authType": "none"
    }
  ]
}
```

`ENV:` prefix means the value is read from the corresponding environment variable at runtime. Secrets are never stored in the JSON file.

### 6.3 Agent Card Template

File: `config/agent-card.json`

```json
{
  "name": "Agentforce Proxy",
  "description": "A2A proxy for Salesforce Agentforce agents",
  "url": "${BASE_URL}/a2a",
  "provider": {
    "organization": "Your Organization",
    "url": "https://your-org.com"
  },
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": true
  },
  "authentication": {
    "schemes": ["bearer"]
  },
  "defaultInputModes": ["text"],
  "defaultOutputModes": ["text"],
  "skills": []
}
```

Skills array is populated from configuration at startup. `${BASE_URL}` is replaced at runtime.

---

## 7. Heroku Deployment

### 7.1 Procfile

```
web: node dist/index.js
```

### 7.2 app.json

```json
{
  "name": "a2a-agentforce-proxy",
  "description": "A2A protocol proxy for Salesforce Agentforce",
  "stack": "heroku-24",
  "buildpacks": [
    { "url": "heroku/nodejs" }
  ],
  "env": {
    "SALESFORCE_SERVER_URL": { "required": true },
    "SALESFORCE_CLIENT_ID": { "required": true },
    "SALESFORCE_CLIENT_SECRET": { "required": true },
    "SALESFORCE_AGENT_ID": { "required": true },
    "SALESFORCE_CLIENT_EMAIL": { "required": true },
    "API_KEY": { "required": true, "generator": "secret" },
    "DELEGATE_API_KEY": { "required": true, "generator": "secret" },
    "SESSION_TTL_SECONDS": { "value": "1800" },
    "LOG_LEVEL": { "value": "info" },
    "NODE_ENV": { "value": "production" }
  },
  "addons": [
    "heroku-redis:mini"
  ],
  "formation": {
    "web": { "quantity": 1, "size": "basic" }
  }
}
```

### 7.3 Heroku Timeout Handling

- Heroku's HTTP router has a **30-second timeout** for the initial byte of the response
- For synchronous calls: if Agentforce takes >25s, the proxy should automatically switch to streaming mode and send a heartbeat
- For streaming calls: send `:heartbeat\n\n` SSE comment every 15 seconds
- Agentforce has a **120-second timeout** — the proxy sets its own timeout to 115 seconds to respond before Agentforce cuts off

---

## 8. Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^5.x | HTTP framework |
| `@a2a-js/sdk` | ^0.3.x | A2A protocol types and utilities |
| `ioredis` | ^5.x | Redis client |
| `pino` | ^9.x | Structured logging |
| `pino-http` | ^10.x | HTTP request logging |
| `uuid` | ^10.x | UUID generation |
| `dotenv` | ^16.x | Environment variable loading (dev) |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.x | TypeScript compiler |
| `vitest` | ^2.x | Test framework |
| `@types/express` | ^5.x | Express type definitions |
| `@types/node` | ^20.x | Node.js type definitions |
| `tsx` | ^4.x | TypeScript execution for dev |
| `eslint` | ^9.x | Linting |
| `prettier` | ^3.x | Code formatting |

---

## 9. Known Risks and Open Questions

### 9.1 Confirmed Risks

1. **Heroku 30s timeout vs Agentforce 120s timeout**: Mitigated by streaming + heartbeats
2. **A2A SDK v0.3 stability**: Pin version, use own types where SDK is insufficient
3. **Agentforce SSE event format**: Not fully documented — needs live testing to confirm exact payload structure

### 9.2 Open Questions (Need Testing)

1. What exact error does Agentforce return when a session expires? (Needed for auto-recovery)
2. What is the maximum number of concurrent sessions per Connected App?
3. Does the `client_email` parameter affect session behavior when `bypassUser: true`?
4. What are the exact JSON structures of streaming SSE events (`TextChunk`, `Inform`, `EndOfTurn`)?
5. Can Agentforce sessions be reused after long idle periods, or do they hard-expire?

### 9.3 Multi-Tenancy Considerations (Post-MVP)

For the SaaS product, multi-tenancy requires:
- Per-tenant Salesforce credentials (encrypted at rest)
- Per-tenant API keys
- Per-tenant agent card configuration
- Tenant isolation in Redis (key prefixing)
- Tenant identification from inbound requests (subdomain, header, or path prefix)
- Rate limiting per tenant

This is deferred to a post-MVP phase. MVP operates as a single-tenant instance that can be deployed per customer.
