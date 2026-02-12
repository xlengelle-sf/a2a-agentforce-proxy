# A2A Proxy for Agentforce — Functional Specifications

## 1. Functional Overview

The proxy operates as a **protocol bridge** between two systems:

```
External A2A Agent  <-->  [ A2A Proxy ]  <-->  Salesforce Agentforce Agent
    (A2A protocol)       (translation)         (Agent API)
```

### Two Communication Directions

**Direction A — Inbound (A2A → Agentforce):**
An external A2A-compatible agent initiates a conversation with an Agentforce agent through the proxy.

**Direction B — Outbound (Agentforce → A2A):**
An Agentforce agent delegates a task to an external A2A-compatible agent through the proxy.

---

## 2. Direction A — Inbound Flow (A2A → Agentforce)

### 2.1 Agent Card Discovery

**User Story:** As an external A2A agent, I can discover the capabilities of the Agentforce agent behind this proxy by fetching its Agent Card.

**Endpoint:** `GET /.well-known/agent-card.json`

**Behavior:**
1. Return a valid A2A Agent Card (JSON) describing the Agentforce agent
2. The card includes: name, description, skills, supported input/output modes, authentication requirements, and the proxy's JSON-RPC endpoint URL
3. The `url` field is dynamically set from the proxy's configured base URL
4. Skills are derived from the Agentforce agent's configured Topics (mapped at configuration time)
5. No authentication required for this endpoint (per A2A spec — public discovery)

**Agent Card Fields (MVP):**
- `name`: Configurable per tenant
- `description`: Configurable per tenant
- `url`: `{BASE_URL}/a2a` (auto-generated)
- `version`: Proxy version
- `capabilities.streaming`: `true`
- `capabilities.pushNotifications`: `false` (MVP)
- `authentication.schemes`: `["bearer"]`
- `defaultInputModes`: `["text"]`
- `defaultOutputModes`: `["text"]`
- `skills[]`: Configurable list (name, description, tags, examples)

### 2.2 Send Message (Synchronous)

**User Story:** As an external A2A agent, I can send a message to the Agentforce agent and receive a complete response.

**Endpoint:** `POST /a2a` (JSON-RPC 2.0)
**Method:** `tasks/send`

**Flow:**
1. External agent sends a JSON-RPC request with `method: "tasks/send"` containing a `message` object with `parts` (TextPart, DataPart, etc.)
2. Proxy validates the request (auth, schema)
3. Proxy extracts text content from message `parts` (concatenates TextParts, serializes DataParts as JSON)
4. If this `contextId` is new: proxy creates a new Agentforce session (OAuth → create session)
5. If this `contextId` is known: proxy reuses the existing Agentforce session, increments `sequenceId`
6. Proxy sends the text to Agentforce Agent API (`POST /sessions/{sessionId}/messages`)
7. Proxy receives the Agentforce response
8. Proxy translates the response to an A2A `Task` object with `Artifact` containing `TextPart`
9. Proxy determines task state:
   - Agent returned a definitive answer → `completed`
   - Agent is asking a clarifying question → `input-required` (heuristic detection)
   - Error occurred → `failed`
10. Proxy returns the JSON-RPC response

**Multi-Turn Conversations:**
- The caller sends a `contextId` in the message to continue an existing conversation
- The proxy maps this `contextId` to the same Agentforce `sessionId`
- `sequenceId` is auto-incremented by the proxy
- If no `contextId` is provided, the proxy generates one and returns it in the response

### 2.3 Send Message (Streaming)

**User Story:** As an external A2A agent, I can send a message and receive the response as a real-time stream.

**Endpoint:** `POST /a2a` (JSON-RPC 2.0) or `POST /a2a/stream`
**Method:** `tasks/sendSubscribe`

**Flow:**
1. Same initial steps as synchronous (validate, translate, session management)
2. Proxy sends the message to Agentforce streaming endpoint (`POST /sessions/{sessionId}/messages/stream`)
3. Proxy bridges Agentforce SSE events to A2A SSE events:
   - `ProgressIndicator` → `TaskStatusUpdateEvent` with `state: "working"`
   - `TextChunk` → `TaskArtifactUpdateEvent` with partial text
   - `Inform` → `TaskArtifactUpdateEvent` with complete text
   - `EndOfTurn` → `TaskStatusUpdateEvent` with `state: "completed"` and `final: true`
4. Proxy sends periodic heartbeat comments (`:heartbeat\n\n`) to keep the Heroku connection alive (30s timeout)

### 2.4 Get Task

**User Story:** As an external A2A agent, I can check the status of a previously submitted task.

**Endpoint:** `POST /a2a` (JSON-RPC 2.0)
**Method:** `tasks/get`

**Behavior:**
- Return the current state of the task (status, artifacts, optional history)
- If `historyLength` param is provided, limit the history accordingly
- Return error if task not found (expired from cache or unknown ID)

### 2.5 Cancel Task

**User Story:** As an external A2A agent, I can cancel an in-progress task.

**Endpoint:** `POST /a2a` (JSON-RPC 2.0)
**Method:** `tasks/cancel`

**Behavior:**
- If the task is in a terminal state (`completed`, `failed`, `canceled`), return error
- Otherwise, delete the Agentforce session and mark the task as `canceled`

---

## 3. Direction B — Outbound Flow (Agentforce → A2A)

### 3.1 Delegate to External Agent

**User Story:** As an Agentforce agent (via an External Service action), I can delegate a task to an external A2A-compatible agent.

**Endpoint:** `POST /api/v1/delegate`
**Format:** REST/JSON (OpenAPI 3.0 — consumable by Agentforce External Services)

**Request:**
```json
{
  "agentAlias": "weather-agent",
  "message": "What is the weather forecast in Paris for tomorrow?",
  "contextId": "optional-for-multi-turn"
}
```

**Response:**
```json
{
  "taskId": "uuid",
  "contextId": "uuid",
  "status": "completed",
  "response": "Tomorrow in Paris: 18°C, partly cloudy...",
  "artifacts": [
    {
      "parts": [{ "type": "text", "text": "..." }]
    }
  ]
}
```

**Flow:**
1. Agentforce calls `POST /api/v1/delegate` with agent alias and message
2. Proxy validates the request (API key auth)
3. Proxy looks up the target agent by `agentAlias` in the external agents registry
4. Proxy fetches (or uses cached) Agent Card from the target agent
5. Proxy translates the message to A2A format (`Message` with `TextPart`)
6. Proxy sends `tasks/send` JSON-RPC to the target agent's endpoint
7. Proxy receives the A2A `Task` response
8. Proxy extracts the text from the response artifacts
9. Proxy returns a flat JSON response to Agentforce

**Multi-Turn (Outbound):**
- If `contextId` is provided, the proxy includes it in the A2A message
- The proxy caches the A2A taskId/contextId mapping for follow-up calls

### 3.2 List Available Agents

**User Story:** As an Agentforce agent (or admin), I can query what external A2A agents are available.

**Endpoint:** `GET /api/v1/agents`

**Response:**
```json
{
  "agents": [
    {
      "alias": "weather-agent",
      "name": "Weather Forecast Agent",
      "description": "Provides weather forecasts",
      "skills": ["weather", "forecast"],
      "status": "available"
    }
  ]
}
```

### 3.3 Discover External Agent

**User Story:** As an admin, I can trigger re-discovery of an external agent's capabilities.

**Endpoint:** `POST /api/v1/agents/{alias}/discover`

**Behavior:**
- Fetch a fresh Agent Card from the external agent's `/.well-known/agent-card.json`
- Update the cached card
- Return the updated agent information

---

## 4. Session and State Management

### 4.1 Session Mapping

The proxy maintains a mapping between A2A concepts and Agentforce concepts:

| A2A Concept | Agentforce Concept | Mapping Strategy |
|-------------|-------------------|------------------|
| `contextId` | `sessionId` | 1:1 — same contextId always maps to same sessionId |
| `taskId` | N/A (one per message exchange) | Generated by proxy, stored with task state |
| N/A | `sequenceId` | Auto-incremented by proxy per contextId |

### 4.2 Session Lifecycle

1. **Creation**: First message with a new/empty `contextId` → create Agentforce session
2. **Reuse**: Subsequent messages with same `contextId` → reuse session, increment `sequenceId`
3. **Expiration**: Sessions expire after configurable TTL (default: 30 minutes of inactivity)
4. **Cleanup**: Expired sessions trigger Agentforce session deletion (`DELETE /sessions/{id}`)
5. **Recovery**: If an Agentforce session is expired/invalid, proxy auto-creates a new one (transparent to caller)

### 4.3 State Storage

- **Production**: Redis (Heroku Redis) — survives dyno restarts, supports multi-dyno
- **Development**: In-memory Map — no external dependencies
- Storage interface is abstract to support future backends (PostgreSQL, etc.)

---

## 5. Authentication & Security

### 5.1 Inbound Authentication (A2A agents calling the proxy)

- **Scheme**: Bearer token (API key) declared in the Agent Card
- **Validation**: Proxy validates the `Authorization: Bearer <token>` header
- **Per-tenant**: Each tenant has their own API key
- **Agent Card endpoint**: Public (no auth required, per A2A spec)

### 5.2 Outbound Authentication (Proxy calling Agentforce)

- **Scheme**: OAuth 2.0 Client Credentials Flow
- **Token endpoint**: `https://{salesforce-domain}/services/oauth2/token`
- **Parameters**: `grant_type=client_credentials`, `client_id`, `client_secret`, `client_email`
- **Token caching**: Cached until expiry, auto-refreshed
- **Per-tenant**: Each tenant provides their own Salesforce Connected App credentials

### 5.3 Outbound Authentication (Proxy calling external A2A agents)

- **Scheme**: Per-agent, declared in external agent's Agent Card
- **Supported**: Bearer token, API key (MVP)
- **Configuration**: Credentials stored per agent in the registry with env-var references

### 5.4 Endpoint Security (Agentforce calling the proxy)

- **Scheme**: API key in `X-API-Key` header
- **Configuration**: Key stored in Salesforce Named Credential, matched against Heroku Config Var

---

## 6. Error Handling

### 6.1 Error Mapping

| Source Error | HTTP Status | A2A JSON-RPC Error Code | A2A Message |
|-------------|------------|------------------------|-------------|
| Invalid JSON-RPC | 400 | -32700 | Parse error |
| Invalid request structure | 400 | -32600 | Invalid Request |
| Unknown method | 400 | -32601 | Method not found |
| Invalid params | 400 | -32602 | Invalid params |
| Agentforce OAuth failure | 401 | -32001 | Authentication error |
| Task not found | 404 | -32001 | Task not found |
| Agentforce timeout (120s) | 504 | -32603 | Internal error: upstream timeout |
| Agentforce server error | 500 | -32603 | Internal error |
| Rate limited | 429 | -32005 | Rate limit exceeded |

### 6.2 Retry Strategy

- **OAuth token expired**: Auto-refresh and retry once
- **Agentforce session expired**: Auto-create new session and retry once
- **Network errors**: No automatic retry (let the A2A caller decide)
- **Rate limits**: Return error immediately with retry-after hint

---

## 7. Observability

### 7.1 Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 3600,
  "redis": "connected",
  "timestamp": "2026-02-12T10:00:00Z"
}
```

### 7.2 Logging

- Structured JSON logs (pino)
- Every request/response logged with correlation ID
- Agentforce API calls logged (request/response, timing)
- A2A protocol events logged (method, taskId, contextId)
- Sensitive data (tokens, credentials) redacted from logs

### 7.3 Metrics (Post-MVP)

- Request count by direction (inbound/outbound)
- Response latency percentiles
- Error rates by type
- Active sessions count
- Agentforce API call success/failure rates
