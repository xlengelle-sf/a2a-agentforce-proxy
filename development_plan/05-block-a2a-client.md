# Block 5 — A2A Client (Outbound to External Agents)

## Goal

The proxy can discover and communicate with external A2A-compatible agents: fetch their Agent Cards, send messages, and receive responses.

## Dependencies

Block 1 (config, logger, errors)

## Tasks

### 5.1 Implement Agent Card Resolver

**File:** `src/a2a/client/agent-card-resolver.ts`

**Behavior:**
1. Given an agent URL, fetch `GET {url}/.well-known/agent-card.json`
2. Validate the response (required fields: name, url, skills)
3. Cache the card with a configurable TTL (default: 5 minutes)
4. Return the typed `AgentCard`
5. Handle errors gracefully (network error, invalid JSON, 404)

```typescript
class AgentCardResolver {
  async resolve(agentUrl: string): Promise<AgentCard>
  invalidateCache(agentUrl: string): void
}
```

### 5.2 Implement A2A Client

**File:** `src/a2a/client/a2a-client.ts`

**Behavior:**
1. Build a JSON-RPC 2.0 request for `tasks/send`
2. Include authentication as required by the target agent's Agent Card
3. POST to the agent's JSON-RPC endpoint
4. Parse the response as an A2A `Task`
5. Handle errors (network, JSON-RPC errors, timeouts)

```typescript
class A2AClient {
  constructor(
    private cardResolver: AgentCardResolver,
    private logger: Logger
  ) {}

  async sendMessage(
    agentUrl: string,
    message: A2AMessage,
    options?: {
      contextId?: string;
      taskId?: string;
      auth?: { type: string; token: string };
    }
  ): Promise<A2ATask>

  async getTask(agentUrl: string, taskId: string): Promise<A2ATask>
  async cancelTask(agentUrl: string, taskId: string): Promise<A2ATask>
}
```

### 5.3 Implement Auth for Outbound Requests

Based on the target agent's configuration in `external-agents.json`:

- **`bearer`**: Add `Authorization: Bearer {token}` header
- **`apiKey`**: Add `{authHeader}: {token}` header (e.g., `X-API-Key: ...`)
- **`none`**: No auth header

The token value may reference an environment variable via `ENV:VAR_NAME` syntax.

### 5.4 Create External Agents Registry

**File:** `config/external-agents.json`

Create with example agents (see specs/03 section 6.2).

**File:** `src/config/agent-registry.ts`

```typescript
class AgentRegistry {
  constructor(configPath: string) {}

  getAgent(alias: string): ExternalAgentConfig | null
  listAgents(): ExternalAgentConfig[]
  resolveAuthToken(agent: ExternalAgentConfig): string | null
}
```

### 5.5 Client Factory

**File:** `src/a2a/client/index.ts`

```typescript
function createA2AClient(): A2AClient {
  const resolver = new AgentCardResolver();
  return new A2AClient(resolver, logger);
}
```

### 5.6 Write Unit Tests

**Files:**
- `tests/unit/a2a/agent-card-resolver.test.ts`
- `tests/unit/a2a/a2a-client.test.ts`

Test cases:
- Resolve Agent Card from a mock endpoint
- Cache hit: second call uses cached card
- Cache miss after TTL: re-fetches
- Error handling: 404, network error, invalid JSON
- Send message and parse Task response
- Auth header applied correctly per config
- JSON-RPC error handling

### 5.7 Create Test Script

**File:** `scripts/test-a2a-client.ts`

A standalone script to test against a real external A2A agent:
1. Resolve Agent Card
2. Send a test message
3. Print the response

Run with: `npx tsx scripts/test-a2a-client.ts <agent-url> <message>`

## Verification

- [ ] `npm test` — all A2A client tests pass
- [ ] Agent Card Resolver fetches and caches correctly
- [ ] A2A Client sends JSON-RPC and parses Task response
- [ ] Auth tokens resolved from env vars correctly
- [ ] Error handling for network/protocol errors

## Files Created

```
src/a2a/client/
├── index.ts
├── a2a-client.ts
└── agent-card-resolver.ts

src/config/
└── agent-registry.ts

config/
└── external-agents.json

scripts/
└── test-a2a-client.ts

tests/unit/a2a/
├── agent-card-resolver.test.ts
└── a2a-client.test.ts
```
