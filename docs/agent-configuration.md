# Agent Configuration

## Proxy Agent Card

The proxy exposes an A2A Agent Card at `/.well-known/agent-card.json`. This allows other A2A agents to discover the proxy's capabilities.

The card is automatically generated from your configuration. Key fields:

```json
{
  "name": "Agentforce Proxy Agent",
  "url": "https://your-proxy.herokuapp.com",
  "version": "0.1.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": false
  },
  "skills": [
    {
      "id": "salesforce-agentforce",
      "name": "Salesforce Agentforce",
      "description": "Bridges messages to a Salesforce Agentforce agent"
    }
  ],
  "defaultInputModes": ["text"],
  "defaultOutputModes": ["text"],
  "authentication": {
    "schemes": ["bearer"]
  }
}
```

## Registering External A2A Agents

External agents that Agentforce can delegate to are configured in `config/external-agents.json`:

```json
{
  "agents": [
    {
      "alias": "weather-agent",
      "url": "https://weather-agent.example.com",
      "description": "Provides real-time weather information",
      "authType": "bearer",
      "authToken": "ENV:WEATHER_AGENT_TOKEN"
    },
    {
      "alias": "search-agent",
      "url": "https://search.example.com",
      "description": "Web search and knowledge retrieval",
      "authType": "apiKey",
      "authToken": "sk-search-12345"
    },
    {
      "alias": "public-agent",
      "url": "https://open-agent.example.com",
      "description": "Public agent with no authentication",
      "authType": "none"
    }
  ]
}
```

### Agent Properties

| Property | Required | Description |
|---|---|---|
| `alias` | ✅ | Unique identifier used in delegate requests |
| `url` | ✅ | Base URL of the A2A agent |
| `description` | | Human-readable description |
| `authType` | ✅ | Authentication type: `bearer`, `apiKey`, or `none` |
| `authToken` | | Token or `ENV:VAR_NAME` for environment variable lookup |

### Token Resolution

Tokens prefixed with `ENV:` are resolved from environment variables at runtime:

```json
{
  "authToken": "ENV:MY_AGENT_TOKEN"
}
```

This resolves to the value of `process.env.MY_AGENT_TOKEN`. This is recommended for production to avoid storing secrets in config files.

### Authentication Types

| Type | Header | Example |
|---|---|---|
| `bearer` | `Authorization: Bearer <token>` | OAuth tokens, JWT |
| `apiKey` | `x-api-key: <token>` | Simple API keys |
| `none` | _(no auth header)_ | Public endpoints |

## Testing an External Agent

### 1. Discover the Agent

```bash
curl -X POST https://your-proxy.herokuapp.com/api/v1/agents/weather-agent/discover \
  -H "X-API-Key: YOUR_DELEGATE_API_KEY" | jq
```

This fetches the agent's Agent Card from `{url}/.well-known/agent-card.json`.

### 2. Send a Test Message

```bash
curl -X POST https://your-proxy.herokuapp.com/api/v1/delegate \
  -H "X-API-Key: YOUR_DELEGATE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentAlias": "weather-agent",
    "message": "What is the weather in San Francisco?"
  }'
```

### 3. Multi-Turn Conversation

Use the `contextId` from the first response to continue the conversation:

```bash
curl -X POST https://your-proxy.herokuapp.com/api/v1/delegate \
  -H "X-API-Key: YOUR_DELEGATE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentAlias": "weather-agent",
    "message": "What about tomorrow?",
    "contextId": "ctx-abc123"
  }'
```

## Agent Card Caching

The proxy caches Agent Cards for 5 minutes by default. To force a fresh fetch, use the discover endpoint.
