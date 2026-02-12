# Block 6 — Delegate Endpoint (Agentforce → A2A)

## Goal

Agentforce agents can delegate tasks to external A2A agents by calling the proxy's REST endpoint, which is registered as an External Service in Salesforce.

## Dependencies

- Block 3 (Session Manager — for outbound session state)
- Block 5 (A2A Client — to call external agents)

## Tasks

### 6.1 Implement Delegate Handler

**File:** `src/agentforce/action-endpoint/delegate.ts`

**Route:** `POST /api/v1/delegate`

**Request format:**
```json
{
  "agentAlias": "weather-agent",
  "message": "What is the weather in Paris tomorrow?",
  "contextId": "optional-for-multi-turn"
}
```

**Flow:**
1. Validate request (agentAlias required, message required)
2. Authenticate request (API key via `X-API-Key` header)
3. Look up agent by alias in Agent Registry
4. If contextId provided, look up existing outbound session
5. Create A2A Message with TextPart from the message text
6. Call A2A Client to send the message to the target agent
7. Extract text response from the A2A Task artifacts
8. Store outbound session state (taskId, contextId) for multi-turn
9. Return flat JSON response

**Response format:**
```json
{
  "taskId": "uuid",
  "contextId": "uuid",
  "status": "completed",
  "response": "Tomorrow in Paris: 18°C, partly cloudy...",
  "artifacts": [...]
}
```

### 6.2 Implement List Agents Endpoint

**File:** `src/agentforce/action-endpoint/delegate.ts` (same file)

**Route:** `GET /api/v1/agents`

Returns the list of configured external A2A agents with their alias, name, description, and availability status.

### 6.3 Implement Discover Agent Endpoint

**Route:** `POST /api/v1/agents/{alias}/discover`

Triggers a fresh Agent Card fetch for the specified agent and returns the updated info.

### 6.4 Create OpenAPI Specification

**File:** `openapi/agentforce-action.yaml`

OpenAPI 3.0 spec for the delegate endpoint, ready to be imported as a Salesforce External Service:

- Describes the `POST /api/v1/delegate` endpoint
- Includes proper descriptions for each field (Agentforce uses these for action discovery)
- Includes `x-sfdc` annotations if needed for auto-action creation
- Describes request schema, response schema, and error responses
- Includes security scheme (API key)

### 6.5 Implement Auth Middleware for Delegate Endpoint

Reuse `src/shared/middleware/auth.ts` but check against `DELEGATE_API_KEY` (separate from the inbound A2A API key).

### 6.6 Wire Routes

**File:** `src/agentforce/action-endpoint/index.ts`

```typescript
import { Router } from 'express';
export function createDelegateRouter(): Router {
  const router = Router();
  router.post('/api/v1/delegate', authMiddleware, delegateHandler);
  router.get('/api/v1/agents', authMiddleware, listAgentsHandler);
  router.post('/api/v1/agents/:alias/discover', authMiddleware, discoverHandler);
  return router;
}
```

Register in `src/app.ts`.

### 6.7 Translation for Outbound Direction

**File:** `src/translation/agentforce-to-a2a.ts` (extend)

Add function to translate simple text (from Agentforce action call) to A2A Message:

```typescript
function createA2AMessageFromText(text: string): A2AMessage {
  return {
    role: 'user',
    parts: [{ type: 'text', text }]
  };
}
```

Add function to extract text from A2A Task response:

```typescript
function extractTextFromA2ATask(task: A2ATask): string {
  // Iterate artifacts, find TextParts, concatenate
}
```

### 6.8 Write Unit Tests

**Files:**
- `tests/unit/agentforce/delegate.test.ts`

Test cases:
- Successful delegation: send message, get response
- Agent not found: return 404
- Missing message: return 400
- Multi-turn: same contextId reuses A2A context
- External agent error: proper error response
- Auth failure: missing or wrong API key → 401

### 6.9 Write Integration Test

**File:** `tests/integration/outbound-flow.test.ts`

End-to-end test with a mock A2A agent:
1. Start the Express app
2. Start a mock A2A agent server
3. Register the mock agent in external-agents.json
4. POST to `/api/v1/delegate`
5. Verify the mock received the correct JSON-RPC request
6. Verify the proxy returned the correct flat JSON response

### 6.10 Document Salesforce Configuration

**File:** `docs/salesforce-setup.md`

Step-by-step guide for setting up the proxy as an External Service in Salesforce:
1. Create Named Credential (URL = proxy base URL, API key auth)
2. Create External Service (import OpenAPI spec)
3. Create Agent Action referencing the External Service operation
4. Configure the action in Agentforce Studio

## Verification

- [ ] `npm test` — all delegate endpoint tests pass
- [ ] `curl POST /api/v1/delegate` with valid payload returns A2A agent response
- [ ] `curl GET /api/v1/agents` returns configured agents
- [ ] Auth works: missing/wrong API key returns 401
- [ ] Integration test with mock A2A agent passes
- [ ] OpenAPI spec is valid (validate with swagger-cli or similar)

## Files Created

```
src/agentforce/action-endpoint/
├── index.ts
└── delegate.ts

openapi/
└── agentforce-action.yaml

docs/
└── salesforce-setup.md

tests/unit/agentforce/
└── delegate.test.ts

tests/integration/
└── outbound-flow.test.ts
```
