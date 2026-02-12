# A2A Proxy for Agentforce — Vision & Overview

## 1. What Is This Product?

A **SaaS proxy service** deployed on Heroku that enables **bidirectional communication** between Salesforce Agentforce agents and any external AI agent compatible with the Google A2A (Agent-to-Agent) protocol.

The proxy translates between the two protocols in real time, allowing:
- **Inbound**: External A2A agents discover and interact with Agentforce agents through standard A2A protocol endpoints
- **Outbound**: Agentforce agents delegate tasks to external A2A agents through an External Service action

## 2. The Problem

Salesforce Agentforce agents are powerful but live within the Salesforce ecosystem. External AI agents (built with LangChain, CrewAI, Google ADK, AWS Bedrock, custom frameworks, etc.) use the open A2A protocol to communicate. There is currently no turnkey solution for organizations to bridge these two worlds.

**Without this proxy:**
- Enterprises must build custom integrations for each agent-to-agent connection
- Agentforce agents cannot participate in multi-vendor agent ecosystems
- External agents cannot leverage Agentforce capabilities (CRM data, business processes, Salesforce actions)

**With this proxy:**
- Any A2A-compatible agent can talk to Agentforce agents immediately
- Agentforce agents can delegate to any A2A-compatible external agent
- Organizations configure connections through a simple registry — no code required

## 3. Target Users

- **Salesforce customers** who want their Agentforce agents to interoperate with external AI agents
- **AI platform vendors** who want their agents to access Salesforce capabilities
- **System integrators** building multi-agent architectures that include Salesforce
- **ISVs** building products that need Agentforce connectivity

## 4. Product Positioning

This is a **SaaS product** — a managed proxy service that customers subscribe to. It is NOT a framework, library, or self-hosted tool (though self-hosted deployment may be offered later).

### Relationship to Existing Solutions

| Solution | What It Does | How We Differ |
|----------|-------------|---------------|
| MuleSoft A2A Connector | Enterprise A2A gateway via MuleSoft | We are lightweight, Heroku-native, no MuleSoft license required |
| agentgateway (Linux Foundation) | Generic A2A+MCP proxy (Rust) | We are Agentforce-specialized with deep protocol translation |
| salesforce-agentforce-a2a-wrapper (mvrzan) | Open-source demo/reference project | We are a production SaaS product with multi-tenant support |
| Claude-A2A-AF (existing Python prototype) | Single-tenant proof of concept | We are multi-tenant, bidirectional, production-grade |

## 5. Key Capabilities (MVP)

1. **A2A Agent Card Discovery** — Expose Agentforce agents as discoverable A2A agents
2. **Inbound Message Translation** — Receive A2A messages, translate to Agentforce Agent API calls, return A2A responses
3. **Outbound Delegation** — Agentforce calls the proxy to delegate to external A2A agents
4. **Session/Task Management** — Bridge A2A task-based model with Agentforce session-based model
5. **Multi-Tenant Configuration** — Support multiple customers with isolated configurations
6. **Streaming** — Real-time SSE streaming in both directions
7. **Observability** — Structured logging, health checks, conversation tracing

## 6. Key Capabilities (Post-MVP / Roadmap)

- Self-service onboarding UI (web dashboard)
- Usage metering and billing integration
- Multi-agent routing (one proxy instance routes to multiple Agentforce agents per tenant)
- Advanced security: mTLS, agent card signing, IP allowlisting
- Rate limiting per tenant
- Analytics dashboard (conversation volume, latency, error rates)
- Webhook notifications for conversation events

## 7. Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js 20 LTS | Heroku-native, strong async/streaming support |
| Language | TypeScript 5.x | Type safety for protocol translation |
| HTTP Framework | Express 5.x | Mature, well-understood, Heroku-compatible |
| A2A Protocol | @a2a-js/sdk v0.3.x | Official JS SDK for A2A v0.3 (stable) |
| State Store | Redis (Heroku Redis) | Session mapping, token caching, survives dyno restarts |
| Auth (outbound to SF) | OAuth 2.0 Client Credentials | Direct, no AppLink dependency, portable |
| Logging | pino | High-performance structured JSON logging |
| Testing | vitest | Fast, TypeScript-native |
| Deployment | Heroku (web dyno + Redis) | Salesforce ecosystem, managed infrastructure |

## 8. Protocol Versions

- **A2A**: v0.3 (current stable) — code structured for future v1.0 upgrade
- **Agentforce Agent API**: v1 (`/einstein/ai-agent/v1/`)

## 9. Reference Sources

### A2A Protocol
- Official specification: https://a2a-protocol.org/latest/specification/
- GitHub: https://github.com/a2aproject/A2A
- JS SDK: https://github.com/a2aproject/a2a-js (npm: @a2a-js/sdk)
- Python SDK: https://github.com/a2aproject/a2a-python
- Samples: https://github.com/a2aproject/a2a-samples
- Google announcement: https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/

### Agentforce Agent API
- Developer Guide: https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api.html
- API Reference: https://developer.salesforce.com/docs/ai/agentforce/references/agent-api?meta=summary
- Get Started: https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api-get-started.html
- Session Lifecycle: https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api-lifecycle.html
- Postman Collection: https://www.postman.com/salesforce-developers/salesforce-developers/documentation/gwv9bjy/agent-api

### Salesforce + A2A
- Agent Interoperability: https://www.salesforce.com/blog/agent-interoperability/
- Agentforce 3 / AgentExchange: https://www.salesforce.com/blog/connected-agents-agentexchange/
- Architecture patterns: https://architect.salesforce.com/fundamentals/agentic-patterns

### Reference Implementations (local)
- Python Agentforce client: `/Users/xlengelle/Code/agentforce_simple_client/agentforce_client.py`
- Python A2A adapter: `/Users/xlengelle/Code/Claude-A2A-AF/`
- Apex Agentforce classes: `/Users/xlengelle/Code/AGENTFORCE API/`
- Community reference: https://github.com/mvrzan/salesforce-agentforce-a2a-wrapper
