# Block 4 — Inbound A2A Server (A2A → Agentforce)

## Goal

External A2A agents can discover the proxy via Agent Card, send messages via JSON-RPC, and receive Agentforce responses translated to A2A format. This is the **core MVP deliverable**.

## Dependencies

- Block 2 (Agentforce Client — auth, session, messaging)
- Block 3 (Session Manager — state mapping)

## Tasks

### 4.1 Define A2A Types

**File:** `src/a2a/types.ts`

Use types from `@a2a-js/sdk` where available. Define missing types ourselves:

```typescript
// Key types needed (verify against SDK exports):
// - AgentCard, Skill, Capability
// - Message, Part (TextPart, DataPart, FilePart)
// - Task, TaskStatus, TaskState
// - Artifact
// - JsonRpcRequest, JsonRpcResponse, JsonRpcError

// If SDK doesn't export these cleanly, define locally:
type TaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled' | 'rejected';

interface A2ATask {
  id: string;
  contextId: string;
  status: {
    state: TaskState;
    message?: A2AMessage;
    timestamp: string;
  };
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
}
```

### 4.2 Implement Translation Layer

**File:** `src/translation/a2a-to-agentforce.ts`

```typescript
function translateA2AMessageToText(message: A2AMessage): string
// Extract text from parts, concatenate, handle DataPart/FilePart
```

**File:** `src/translation/agentforce-to-a2a.ts`

```typescript
function translateAgentforceResponseToTask(
  response: AgentforceMessageResponse,
  taskId: string,
  contextId: string
): A2ATask
// Create Task with Artifact containing TextPart from Agentforce response
// Determine task state (completed vs input-required)
```

**File:** `src/translation/error-mapper.ts`

```typescript
function mapAgentforceErrorToJsonRpc(error: Error): JsonRpcError
// See error mapping table in specs/02 section 6.1
```

### 4.3 Implement Agent Card Handler

**File:** `src/a2a/server/agent-card.ts`

- Load Agent Card template from `config/agent-card.json`
- Replace `${BASE_URL}` with actual base URL from config
- Serve at `GET /.well-known/agent-card.json`
- No authentication required
- Cache the loaded card in memory (reload on config change)

### 4.4 Implement JSON-RPC Handler

**File:** `src/a2a/server/jsonrpc-handler.ts`

This is the main entry point for inbound A2A requests.

**Route:** `POST /a2a`

**Flow:**
1. Parse request body as JSON
2. Validate JSON-RPC 2.0 envelope (version, id, method, params)
3. Authenticate the request (Bearer token from Authorization header)
4. Dispatch by method:
   - `tasks/send` → `handleSendTask(params)`
   - `tasks/get` → `handleGetTask(params)`
   - `tasks/cancel` → `handleCancelTask(params)`
   - `tasks/sendSubscribe` → redirect to streaming handler (Block 7)
   - Unknown → JSON-RPC error -32601 (Method not found)
5. Return JSON-RPC response

**`handleSendTask(params)` flow:**
1. Extract `message`, `id` (taskId), `contextId` from params
2. If no taskId, generate one
3. If no contextId, generate one
4. Look up existing session by contextId in Session Manager
5. If no session exists:
   a. Authenticate with Agentforce (AgentforceClient.authenticate())
   b. Create Agentforce session (AgentforceClient.createSession())
   c. Create session mapping in Session Manager
6. Get next sequenceId from Session Manager
7. Translate A2A message to text (Translation Layer)
8. Send message to Agentforce (AgentforceClient.sendMessage())
9. Translate response to A2A Task (Translation Layer)
10. Update task state in Session Manager
11. Return Task as JSON-RPC result

**`handleGetTask(params)` flow:**
1. Extract taskId from params
2. Look up session by taskId in Session Manager
3. Return cached task state
4. Apply historyLength if specified

**`handleCancelTask(params)` flow:**
1. Extract taskId from params
2. Look up session by taskId
3. If task in terminal state, return error
4. Delete Agentforce session
5. Update session state to canceled
6. Return updated task

### 4.5 Wire Routes

**File:** `src/a2a/server/index.ts`

```typescript
import { Router } from 'express';
export function createA2ARouter(): Router {
  const router = Router();
  router.get('/.well-known/agent-card.json', agentCardHandler);
  router.post('/a2a', jsonRpcHandler);
  return router;
}
```

Register in `src/app.ts`.

### 4.6 Implement Auth Middleware (Basic)

**File:** `src/shared/middleware/auth.ts`

- Extract `Authorization: Bearer <token>` from header
- Compare against configured `API_KEY`
- Return 401 if missing or invalid
- Skip for Agent Card endpoint

### 4.7 Create Agent Card Config

**File:** `config/agent-card.json`

Based on the template in specs/03 section 6.3, with placeholder skills.

### 4.8 Write Unit Tests

**Files:**
- `tests/unit/translation/a2a-to-agentforce.test.ts`
- `tests/unit/translation/agentforce-to-a2a.test.ts`
- `tests/unit/a2a/jsonrpc-handler.test.ts`

Test cases:
- Translate A2A TextPart message to Agentforce text
- Translate A2A DataPart to appended JSON text
- Translate Agentforce response to A2A Task (completed state)
- Translate Agentforce response to A2A Task (input-required detection)
- JSON-RPC dispatch to correct handler
- JSON-RPC validation errors (bad version, missing method)
- Full inbound flow with mocked Agentforce API

### 4.9 Write Integration Test

**File:** `tests/integration/inbound-flow.test.ts`

End-to-end test with mocked Agentforce API:
1. Start the Express app
2. Mock Agentforce OAuth and Agent API endpoints
3. Send a JSON-RPC `tasks/send` request
4. Verify the response is a valid A2A Task
5. Send a follow-up message with the same contextId
6. Verify the session was reused (same Agentforce sessionId, incremented sequenceId)

### 4.10 Create Test Fixtures

**File:** `tests/fixtures/a2a-messages.ts`

Sample A2A messages for testing (simple text, with data, multi-part).

**File:** `tests/fixtures/agentforce-responses.ts`

Sample Agentforce responses for testing (successful, with question, error).

## Verification

- [ ] `npm test` — all translation and handler tests pass
- [ ] `curl GET /.well-known/agent-card.json` returns valid Agent Card
- [ ] `curl POST /a2a` with `tasks/send` JSON-RPC returns a valid A2A Task
- [ ] Multi-turn: second message with same contextId reuses session
- [ ] Error handling: invalid JSON-RPC returns proper error
- [ ] Integration test passes end-to-end with mocked Agentforce

**Live test (requires real Salesforce credentials):**
- [ ] Send a real message through the proxy and get an Agentforce response
- [ ] Verify the response is a properly formatted A2A Task

## Files Created

```
src/a2a/
├── server/
│   ├── index.ts
│   ├── agent-card.ts
│   └── jsonrpc-handler.ts
├── types.ts

src/translation/
├── a2a-to-agentforce.ts
├── agentforce-to-a2a.ts
└── error-mapper.ts

src/shared/middleware/
└── auth.ts

config/
└── agent-card.json

tests/unit/translation/
├── a2a-to-agentforce.test.ts
└── agentforce-to-a2a.test.ts

tests/unit/a2a/
└── jsonrpc-handler.test.ts

tests/integration/
└── inbound-flow.test.ts

tests/fixtures/
├── a2a-messages.ts
└── agentforce-responses.ts
```
