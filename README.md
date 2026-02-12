# A2A Agentforce Proxy

A bidirectional proxy that bridges **Salesforce Agentforce** agents and **A2A-compatible** (Agent-to-Agent protocol v0.3) external agents.

```
┌────────────────────┐       ┌─────────────────────┐       ┌────────────────────┐
│   External A2A     │       │   A2A Agentforce     │       │   Salesforce       │
│   Agents           │◄─────►│   Proxy              │◄─────►│   Agentforce       │
│   (any vendor)     │ A2A   │   (this project)     │ Agent │   Agent API        │
└────────────────────┘ JSON  └─────────────────────┘  API  └────────────────────┘
                       RPC          ▲
                                    │ REST
                       ┌────────────┘
                       ▼
              ┌────────────────────┐
              │  Agentforce Agent  │
              │  (via Actions)     │
              └────────────────────┘
```

## Key Features

- **Inbound (A2A → Agentforce):** External A2A agents can send messages to Agentforce via standard JSON-RPC
- **Outbound (Agentforce → A2A):** Agentforce agents can delegate tasks to external A2A agents via REST actions
- **Streaming:** Real-time SSE streaming in both directions with heartbeat keep-alive
- **Session Management:** Automatic multi-turn conversation tracking with Redis or in-memory store
- **Agent Discovery:** A2A Agent Card at `/.well-known/agent-card.json`
- **Security:** Helmet headers, CORS, rate limiting, constant-time auth comparison
- **Production Ready:** Structured logging (pino), graceful shutdown, health checks

## Quick Start

### Prerequisites

- Node.js ≥ 20
- A Salesforce org with Agentforce enabled
- A Connected App with OAuth 2.0 Client Credentials

### Local Development

```bash
# Clone and install
git clone <repo-url>
cd a2a-agentforce-proxy
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Salesforce credentials

# Run in development mode
npm run dev

# Run tests
npm test

# Type check
npx tsc --noEmit
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SALESFORCE_SERVER_URL` | ✅ | Salesforce instance URL (e.g., `https://myorg.my.salesforce.com`) |
| `SALESFORCE_CLIENT_ID` | ✅ | Connected App client ID |
| `SALESFORCE_CLIENT_SECRET` | ✅ | Connected App client secret |
| `SALESFORCE_AGENT_ID` | ✅ | Agentforce agent ID |
| `SALESFORCE_CLIENT_EMAIL` | ✅ | Email of the Salesforce user for OAuth |
| `API_KEY` | ✅ | Bearer token for inbound A2A requests |
| `DELEGATE_API_KEY` | ✅ | X-API-Key for outbound delegate requests |
| `PORT` | | Server port (default: `3000`) |
| `BASE_URL` | | Public URL of the proxy |
| `REDIS_URL` | | Redis connection URL for persistent sessions |
| `REDIS_TLS_URL` | | Redis TLS connection URL (Heroku) |
| `SESSION_TTL_SECONDS` | | Session time-to-live (default: `1800`) |
| `LOG_LEVEL` | | Pino log level (default: `info`) |
| `NODE_ENV` | | `development` or `production` |
| `CORS_ORIGINS` | | Comma-separated allowed origins (default: `*`) |
| `RATE_LIMIT_A2A` | | Requests/minute for A2A endpoint (default: `100`) |
| `RATE_LIMIT_DELEGATE` | | Requests/minute for delegate endpoint (default: `60`) |

## Heroku Deployment

```bash
# Create Heroku app
heroku create my-a2a-proxy

# Add Redis (optional, for persistent sessions)
heroku addons:create heroku-redis:mini

# Set environment variables
heroku config:set SALESFORCE_SERVER_URL=https://myorg.my.salesforce.com
heroku config:set SALESFORCE_CLIENT_ID=your-client-id
heroku config:set SALESFORCE_CLIENT_SECRET=your-client-secret
heroku config:set SALESFORCE_AGENT_ID=your-agent-id
heroku config:set SALESFORCE_CLIENT_EMAIL=user@example.com
heroku config:set API_KEY=$(openssl rand -hex 32)
heroku config:set DELEGATE_API_KEY=$(openssl rand -hex 32)
heroku config:set BASE_URL=https://my-a2a-proxy.herokuapp.com
heroku config:set NODE_ENV=production

# Deploy
git push heroku main

# Verify
curl https://my-a2a-proxy.herokuapp.com/health
```

## API Endpoints

### Health Check
```
GET /health
```

### A2A Protocol (Inbound)
```
GET  /.well-known/agent-card.json   # Agent Card discovery
POST /a2a                            # JSON-RPC endpoint
     Authorization: Bearer <API_KEY>

Methods:
  - tasks/send           # Send a message (request/response)
  - tasks/get            # Get task status
  - tasks/cancel         # Cancel a task
  - tasks/sendSubscribe  # Send with SSE streaming
```

### Delegate API (Outbound)
```
POST /api/v1/delegate                # Delegate task to external A2A agent
GET  /api/v1/agents                  # List registered external agents
POST /api/v1/agents/:alias/discover  # Discover agent capabilities
     X-API-Key: <DELEGATE_API_KEY>
```

## Project Structure

```
src/
├── agentforce/
│   ├── client/          # Agentforce API client (auth, session, messaging, streaming)
│   ├── action-endpoint/ # Delegate REST endpoint for Agentforce actions
│   └── types.ts
├── a2a/
│   ├── server/          # Inbound A2A JSON-RPC server + Agent Card + streaming
│   ├── client/          # Outbound A2A client + Agent Card resolver
│   └── types.ts
├── session/             # Session manager + stores (memory, Redis)
├── translation/         # Protocol translation (A2A ↔ Agentforce)
├── config/              # Configuration, env validation, agent registry
├── shared/              # Logger, errors, middleware, SSE, security utilities
├── app.ts               # Express app factory
└── index.ts             # Entry point with graceful shutdown
```

## Documentation

- [Salesforce Setup Guide](docs/salesforce-setup.md)
- [Agent Configuration](docs/agent-configuration.md)
- [API Reference](docs/api-reference.md)

## License

MIT
