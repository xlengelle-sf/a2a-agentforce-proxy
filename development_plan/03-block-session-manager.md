# Block 3 — Session Manager & Store

## Goal

A session management system that bridges A2A's task-based model with Agentforce's session-based model, with both in-memory (dev) and Redis (production) storage backends.

## Dependencies

Block 1 (config, logger, errors)

## Tasks

### 3.1 Define Session Store Interface

**File:** `src/session/store.ts`

```typescript
interface SessionStore {
  get(contextId: string): Promise<SessionMapping | null>;
  set(contextId: string, session: SessionMapping): Promise<void>;
  update(contextId: string, updates: Partial<SessionMapping>): Promise<void>;
  delete(contextId: string): Promise<void>;
  getByTaskId(taskId: string): Promise<SessionMapping | null>;
  cleanup(maxAgeSec: number): Promise<number>;
}
```

### 3.2 Define Session Data Model

**File:** `src/session/session-manager.ts` (types section)

```typescript
interface SessionMapping {
  a2aContextId: string;
  a2aTaskIds: string[];
  afSessionId: string;
  afSequenceId: number;
  afAgentId: string;
  tenantId: string;
  lastTaskState?: object;
  artifacts?: object[];
  createdAt: number;
  lastActivity: number;
  state: 'active' | 'completed' | 'expired';
}
```

### 3.3 Implement In-Memory Store

**File:** `src/session/memory-store.ts`

- Use a `Map<string, SessionMapping>` for primary storage
- Use a second `Map<string, string>` for taskId → contextId reverse lookups
- Implement cleanup by iterating and checking `lastActivity` timestamps
- Suitable for development and testing only

### 3.4 Implement Redis Store

**File:** `src/session/redis-store.ts`

- Use `ioredis` with TLS support (Heroku Redis requires TLS)
- Key schema:
  - `session:{contextId}` → JSON string of SessionMapping
  - `task:{taskId}` → contextId (string)
- Use Redis TTL for automatic expiration (set on every write)
- Handle Redis connection errors gracefully (log and fallback to error)
- Connection pooling via ioredis defaults

**Redis TLS on Heroku:**
```typescript
const redis = new Redis(process.env.REDIS_TLS_URL || process.env.REDIS_URL, {
  tls: process.env.REDIS_TLS_URL ? { rejectUnauthorized: false } : undefined,
});
```

### 3.5 Implement Session Manager

**File:** `src/session/session-manager.ts`

The Session Manager is the high-level orchestrator. It does NOT call Agentforce directly — it manages state only. The caller (A2A server) uses the Session Manager to look up/create mappings, then calls Agentforce separately.

**Methods:**

```typescript
class SessionManager {
  constructor(store: SessionStore) {}

  // Look up existing session by A2A contextId
  async getByContextId(contextId: string): Promise<SessionMapping | null>

  // Look up existing session by A2A taskId
  async getByTaskId(taskId: string): Promise<SessionMapping | null>

  // Create a new session mapping
  async createSession(params: {
    contextId: string;
    taskId: string;
    afSessionId: string;
    afAgentId: string;
    tenantId: string;
  }): Promise<SessionMapping>

  // Record a new task within an existing context
  async addTask(contextId: string, taskId: string): Promise<void>

  // Increment and return the next sequenceId for a context
  async nextSequenceId(contextId: string): Promise<number>

  // Update task state (for tasks/get retrieval)
  async updateTaskState(contextId: string, state: object, artifacts?: object[]): Promise<void>

  // Mark session as completed or expired
  async closeSession(contextId: string, reason: 'completed' | 'expired'): Promise<void>

  // Clean up expired sessions (called periodically)
  async cleanupExpired(): Promise<number>
}
```

### 3.6 Implement Periodic Cleanup

In `src/session/session-manager.ts`:

- Start an interval timer (every 5 minutes) that calls `cleanupExpired()`
- Log the number of sessions cleaned up
- Graceful shutdown: clear the interval on process exit

### 3.7 Store Factory

**File:** `src/session/index.ts`

```typescript
function createSessionStore(): SessionStore {
  if (process.env.REDIS_URL || process.env.REDIS_TLS_URL) {
    return new RedisStore();
  }
  return new MemoryStore();
}
```

### 3.8 Write Unit Tests

**Files:**
- `tests/unit/session/memory-store.test.ts`
- `tests/unit/session/session-manager.test.ts`

Test cases:
- Create a new session, retrieve it by contextId
- Create a session, retrieve it by taskId
- Add multiple tasks to a context
- Increment sequenceId correctly
- Session expiry and cleanup
- Update task state and retrieve it
- Store returns null for unknown keys

## Verification

- [ ] `npm test` — all session manager tests pass
- [ ] In-memory store works for dev: create, read, update, delete, cleanup
- [ ] Redis store works when REDIS_URL is set (test against local Redis or Heroku Redis)
- [ ] Factory correctly selects store based on environment
- [ ] Cleanup removes sessions older than TTL

## Files Created

```
src/session/
├── index.ts
├── store.ts
├── session-manager.ts
├── memory-store.ts
└── redis-store.ts

tests/unit/session/
├── memory-store.test.ts
└── session-manager.test.ts
```
