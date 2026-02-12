# Block 8 — Security, Hardening, Tests & Documentation

## Goal

Production-ready security, comprehensive error handling, test coverage, and documentation. After this block, the proxy is ready for single-tenant deployment.

## Dependencies

All previous blocks (1–7)

## Tasks

### 8.1 Security Hardening

**Rate Limiting:**
- Install `express-rate-limit`
- Apply to `/a2a` endpoint: 100 requests/minute per IP (configurable)
- Apply to `/api/v1/delegate`: 60 requests/minute per IP (configurable)
- Return proper 429 response with `Retry-After` header

**Request Validation:**
- JSON body size limit: 1MB (Express default is fine, but make explicit)
- JSON-RPC schema validation: verify `jsonrpc`, `method`, `params` fields
- Input sanitization: ensure message text is string, not object/array injection

**Security Headers:**
- Install `helmet` for standard security headers
- Configure CORS properly (restrict origins in production via env var)

**Credential Security:**
- Never log tokens, secrets, or API keys (pino redaction)
- OAuth tokens stored in Redis with encryption at rest (Heroku Redis provides this)
- API keys compared using constant-time comparison to prevent timing attacks

**Token Refresh:**
- On 401 from Agentforce: refresh token and retry once
- On 401 from external A2A agent: return error to caller (don't retry — might be wrong credentials)

### 8.2 Error Handling Polish

**Graceful Shutdown:**
```typescript
process.on('SIGTERM', async () => {
  // Stop accepting new connections
  // Wait for in-flight requests to complete (max 10s)
  // Close Redis connection
  // Close Express server
  // Exit
});
```

**Request Timeout:**
- Set global Express timeout to 125 seconds (above Agentforce's 120s)
- For streaming: no timeout (SSE connections are long-lived)
- For delegate endpoint: 60 seconds default (configurable)

**Unhandled Rejection Handler:**
- Log unhandled promise rejections
- Do NOT crash the process (Heroku would restart, losing all in-flight requests)

### 8.3 Comprehensive Test Suite

**Target:** 80% code coverage

**Additional unit tests needed:**
- Config manager: validation, defaults, env var resolution
- Error mapper: all error types
- Auth middleware: valid token, invalid token, missing token
- Health check: with and without Redis

**Integration tests:**
- Full inbound flow: A2A → proxy → mock Agentforce → proxy → A2A
- Full outbound flow: REST → proxy → mock A2A agent → proxy → REST
- Session expiry: send message, wait, send again → auto-recreate session
- Error scenarios: Agentforce down, A2A agent down, invalid credentials
- Streaming: end-to-end SSE flow with mock Agentforce

**Test infrastructure:**
- Mock Agentforce API server (Express-based, returns canned responses)
- Mock A2A agent server (Express-based, implements JSON-RPC)
- Test fixtures for all message types

### 8.4 Documentation

**`README.md`** — Project overview:
- What it does (one paragraph)
- Architecture diagram (ASCII)
- Quick start (local dev)
- Environment variables reference
- Heroku deployment instructions

**`docs/salesforce-setup.md`** — Salesforce configuration:
- Create Connected App (with correct OAuth scopes)
- Create Named Credential for the delegate endpoint
- Create External Service from OpenAPI spec
- Configure Agent Action in Agentforce Studio
- Test the action

**`docs/agent-configuration.md`** — Managing agents:
- How to configure the proxy's Agent Card (skills, capabilities)
- How to register external A2A agents in `external-agents.json`
- How to manage credentials (env vars)
- How to test an external agent connection

**`docs/api-reference.md`** — Endpoint reference:
- Inbound: Agent Card, JSON-RPC methods, SSE streaming
- Outbound: delegate, list agents, discover
- Health check
- Error codes and responses

### 8.5 Pino Log Redaction

Configure pino to redact sensitive fields:

```typescript
const logger = pino({
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      '*.access_token',
      '*.client_secret',
      '*.authToken',
    ],
    censor: '[REDACTED]',
  },
});
```

### 8.6 Health Check Enhancement

Extend `GET /health` to include:
- Redis connectivity status (`connected` / `disconnected` / `not configured`)
- Agentforce API reachability (optional — might add latency)
- Memory usage
- Uptime

### 8.7 Final Heroku Deployment Verification

- Deploy the complete application
- Run through all manual tests:
  1. Health check returns 200
  2. Agent Card is discoverable
  3. Inbound: send a message via JSON-RPC, get Agentforce response
  4. Inbound streaming: send via sendSubscribe, get SSE events
  5. Outbound: call delegate endpoint (requires a live external A2A agent or mock)
  6. Multi-turn: multiple messages in same context
  7. Error handling: bad auth, invalid request, agent timeout
- Check Heroku logs for proper structured logging
- Verify no credential leaks in logs

## Verification

- [ ] `npm test` — 80%+ code coverage, all tests pass
- [ ] Rate limiting: returns 429 after exceeding limit
- [ ] Security headers: helmet headers present in responses
- [ ] Graceful shutdown: SIGTERM handled properly
- [ ] Log redaction: no secrets in log output
- [ ] Documentation: README, Salesforce setup, agent config, API reference
- [ ] Full Heroku deployment: all manual tests pass
- [ ] No credential leaks in Heroku logs

## Files Created/Modified

```
# New files
docs/
├── salesforce-setup.md
├── agent-configuration.md
└── api-reference.md

tests/
├── mocks/
│   ├── agentforce-api.mock.ts
│   └── a2a-agent.mock.ts
└── integration/
    ├── error-scenarios.test.ts
    └── session-lifecycle.test.ts

# Modified files
README.md                       # Full documentation
src/shared/logger.ts            # Add redaction
src/shared/health.ts            # Enhanced health check
src/app.ts                      # Add helmet, rate limiting, CORS
src/index.ts                    # Add graceful shutdown
```
