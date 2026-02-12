# API Reference

## Health Check

### `GET /health`

Returns server health status. No authentication required.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 3600,
  "timestamp": "2025-01-15T10:30:00.000Z",
  "memory": {
    "rss": 45,
    "heapUsed": 22,
    "heapTotal": 35
  },
  "redis": "connected"
}
```

---

## Inbound A2A Protocol

### `GET /.well-known/agent-card.json`

Returns the A2A Agent Card describing the proxy's capabilities.

### `POST /a2a`

JSON-RPC 2.0 endpoint for A2A protocol messages.

**Authentication:** `Authorization: Bearer <API_KEY>`

---

### `tasks/send`

Send a message and receive a synchronous response.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tasks/send",
  "params": {
    "id": "optional-task-id",
    "message": {
      "role": "user",
      "parts": [
        { "type": "text", "text": "What is the weather in Paris?" }
      ]
    },
    "sessionId": "optional-context-id"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "id": "task-abc123",
    "sessionId": "ctx-xyz789",
    "status": {
      "state": "completed",
      "message": {
        "role": "agent",
        "parts": [
          { "type": "text", "text": "The weather in Paris is 18°C and sunny." }
        ]
      }
    },
    "artifacts": [
      {
        "parts": [
          { "type": "text", "text": "The weather in Paris is 18°C and sunny." }
        ],
        "index": 0
      }
    ]
  }
}
```

---

### `tasks/sendSubscribe`

Send a message and receive streaming SSE events.

**Request:** Same as `tasks/send`.

**Response:** Server-Sent Events stream:

```
event: status
data: {"id":"task-abc123","status":{"state":"working"},"final":false}

event: artifact
data: {"id":"task-abc123","artifact":{"parts":[{"type":"text","text":"The weather "}],"index":0,"append":true}}

event: artifact
data: {"id":"task-abc123","artifact":{"parts":[{"type":"text","text":"in Paris is sunny."}],"index":0,"append":true}}

event: status
data: {"id":"task-abc123","status":{"state":"completed"},"final":true}
```

Heartbeat comments (`:heartbeat`) are sent every 15 seconds to keep the connection alive.

---

### `tasks/get`

Get the status of an existing task.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tasks/get",
  "params": {
    "id": "task-abc123"
  }
}
```

---

### `tasks/cancel`

Cancel an in-progress task.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tasks/cancel",
  "params": {
    "id": "task-abc123"
  }
}
```

---

## Outbound Delegate API

### `POST /api/v1/delegate`

Delegate a task to an external A2A agent.

**Authentication:** `X-API-Key: <DELEGATE_API_KEY>`

**Request:**
```json
{
  "agentAlias": "weather-agent",
  "message": "What is the weather in Paris?",
  "contextId": "optional-context-for-multi-turn"
}
```

**Response:**
```json
{
  "taskId": "task-xyz789",
  "contextId": "ctx-abc123",
  "status": "completed",
  "response": "The weather in Paris is 18°C and sunny.",
  "artifacts": [
    {
      "parts": [
        { "type": "text", "text": "The weather in Paris is 18°C and sunny." }
      ],
      "index": 0
    }
  ]
}
```

---

### `GET /api/v1/agents`

List all registered external agents.

**Authentication:** `X-API-Key: <DELEGATE_API_KEY>`

**Response:**
```json
{
  "agents": [
    {
      "alias": "weather-agent",
      "url": "https://weather-agent.example.com",
      "description": "Provides weather information",
      "authType": "bearer"
    }
  ]
}
```

---

### `POST /api/v1/agents/:alias/discover`

Fetch a fresh Agent Card from an external agent.

**Authentication:** `X-API-Key: <DELEGATE_API_KEY>`

**Response:**
```json
{
  "alias": "weather-agent",
  "url": "https://weather-agent.example.com",
  "agentCard": {
    "name": "Weather Agent",
    "url": "https://weather-agent.example.com",
    "skills": [...],
    "capabilities": { "streaming": true }
  }
}
```

---

## Error Codes

### HTTP Errors

| Status | Description |
|---|---|
| 400 | Invalid request body |
| 401 | Missing or invalid authentication |
| 404 | Endpoint or agent not found |
| 413 | Request body too large (>1MB) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 502 | External agent/Agentforce error |

### JSON-RPC Errors

| Code | Name | Description |
|---|---|---|
| -32600 | Invalid Request | Not valid JSON-RPC |
| -32601 | Method Not Found | Unknown method |
| -32602 | Invalid Params | Missing or invalid parameters |
| -32603 | Internal Error | Server-side processing error |
| -32001 | Task Not Found | Referenced task does not exist |
| -32002 | Task Cannot Be Canceled | Task already completed |

### Delegate API Errors

```json
{
  "error": "Agent not found"
}
```

| Error | Cause |
|---|---|
| `Missing agentAlias` | Request missing required field |
| `Missing message` | Request missing required field |
| `Agent not found` | Unknown agent alias |
| `Agent unreachable` | External agent returned an error |
