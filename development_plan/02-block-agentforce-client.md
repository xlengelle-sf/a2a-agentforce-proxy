# Block 2 — Agentforce Client (Auth + Session + Messaging)

## Goal

A complete, tested client for the Salesforce Agentforce Agent API that can authenticate, create sessions, and send/receive messages.

## Dependencies

Block 1 (project scaffolding, logger, config, errors)

## Reference Code

The following existing files contain proven patterns to replicate in TypeScript:

- **Python client**: `/Users/xlengelle/Code/agentforce_simple_client/agentforce_client.py`
  - OAuth flow with `client_email` parameter
  - Session creation with `bypassUser: true`
  - Message sending with `sequenceId` auto-increment
  - 120-second timeout

- **Apex classes**: `/Users/xlengelle/Code/AGENTFORCE API/`
  - `AgentForceAuth.cls`: OAuth token endpoint, `client_credentials` grant
  - `AgentForceSession.cls`: Session creation payload structure
  - `AgentForceMessaging.cls`: Message payload and response parsing

## Tasks

### 2.1 Implement OAuth 2.0 Authentication

**File:** `src/agentforce/client/auth.ts`

**Behavior:**
1. POST to `https://{serverUrl}/services/oauth2/token`
2. Content-Type: `application/x-www-form-urlencoded`
3. Body: `grant_type=client_credentials&client_id=...&client_secret=...&client_email=...`
4. Parse response: `{ access_token, instance_url }`
5. Cache the token with a configurable TTL (default 60 min)
6. Auto-refresh on 401 responses
7. Thread-safe (handle concurrent refresh requests — only one should actually refresh)

**Key detail from reference code:** The `client_email` parameter is included in the OAuth request. This maps to the Salesforce user context the agent runs as.

### 2.2 Implement Session Management

**File:** `src/agentforce/client/session.ts`

**Behavior:**
- `createSession(token, instanceUrl, agentId)` → `sessionId`
  - POST to `https://api.salesforce.com/einstein/ai-agent/v1/agents/{agentId}/sessions`
  - Body: `{ externalSessionKey: uuid, instanceConfig: { endpoint: instanceUrl }, streamingCapabilities: { chunkTypes: ['Text'] }, bypassUser: true }`
  - Returns `sessionId` from response
- `deleteSession(token, sessionId)` → void
  - DELETE to `https://api.salesforce.com/einstein/ai-agent/v1/sessions/{sessionId}`

### 2.3 Implement Synchronous Messaging

**File:** `src/agentforce/client/messaging.ts`

**Behavior:**
- `sendMessage(token, sessionId, sequenceId, text)` → `AgentforceResponse`
  - POST to `https://api.salesforce.com/einstein/ai-agent/v1/sessions/{sessionId}/messages`
  - Body: `{ message: { sequenceId, type: 'Text', text } }`
  - Timeout: 120 seconds
  - Parse response: extract `messages[0].message` as the agent's text response
  - Return structured response with message text, feedbackId, planId

### 2.4 Define Types

**File:** `src/agentforce/types.ts`

```typescript
interface OAuthTokenResponse {
  access_token: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
  signature: string;
}

interface AgentforceSessionRequest {
  externalSessionKey: string;
  instanceConfig: { endpoint: string };
  streamingCapabilities: { chunkTypes: string[] };
  bypassUser: boolean;
}

interface AgentforceSessionResponse {
  sessionId: string;
}

interface AgentforceMessageRequest {
  message: {
    sequenceId: number;
    type: 'Text';
    text: string;
  };
}

interface AgentforceMessageResponse {
  messages: Array<{
    id: string;
    type: string;
    message: string;
    feedbackId?: string;
    planId?: string;
  }>;
}
```

### 2.5 Implement Client Facade

**File:** `src/agentforce/client/index.ts`

A high-level `AgentforceClient` class that combines auth, session, and messaging:

```typescript
class AgentforceClient {
  async authenticate(): Promise<void>           // Get/refresh OAuth token
  async createSession(): Promise<string>        // Create Agentforce session
  async sendMessage(sessionId, seqId, text)     // Send message
  async deleteSession(sessionId): Promise<void> // Clean up
  async healthCheck(): Promise<boolean>         // Test connectivity
}
```

### 2.6 Write Unit Tests

**File:** `tests/unit/agentforce/auth.test.ts`, `session.test.ts`, `messaging.test.ts`

- Mock HTTP responses (use vitest's built-in mocking or msw)
- Test successful auth flow
- Test token caching and refresh
- Test session creation and deletion
- Test message sending and response parsing
- Test error handling (401, 404, 500, timeout)

### 2.7 Create Test Script

**File:** `scripts/test-agentforce.ts`

A standalone script that tests against a real Agentforce instance:
1. Authenticate
2. Create session
3. Send a test message
4. Print the response
5. Delete session

Run with: `npx tsx scripts/test-agentforce.ts`

Requires a `.env` file with real Salesforce credentials.

## Verification

- [ ] `npm test` — all Agentforce client unit tests pass
- [ ] `npx tsx scripts/test-agentforce.ts` — successfully sends a message and receives a response from a real Agentforce agent
- [ ] Token caching works: second call reuses cached token (verify via logs)
- [ ] Error handling: graceful error on wrong credentials, expired session, etc.

## Files Created

```
src/agentforce/
├── client/
│   ├── index.ts
│   ├── auth.ts
│   ├── session.ts
│   └── messaging.ts
└── types.ts

scripts/
└── test-agentforce.ts

tests/unit/agentforce/
├── auth.test.ts
├── session.test.ts
└── messaging.test.ts
```
