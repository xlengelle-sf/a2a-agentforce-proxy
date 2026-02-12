# Salesforce Setup Guide

This guide walks you through configuring Salesforce to work with the A2A Agentforce Proxy in both directions.

## Prerequisites

- A Salesforce org with **Agentforce** enabled
- System Administrator access
- An Agentforce agent created in Agentforce Studio

## 1. Create a Connected App (OAuth 2.0)

The proxy uses OAuth 2.0 Client Credentials to authenticate with Salesforce.

1. **Setup → App Manager → New Connected App**
2. Configure:
   - **Connected App Name:** `A2A Agentforce Proxy`
   - **API Name:** `A2A_Agentforce_Proxy`
   - **Contact Email:** your email
3. **API (Enable OAuth Settings):**
   - ✅ Enable OAuth Settings
   - **Callback URL:** `https://login.salesforce.com/services/oauth2/callback`
   - **Selected OAuth Scopes:**
     - `api` (Access and manage your data)
     - `cdp_api` (Manage Agentforce)
   - ✅ Enable Client Credentials Flow
4. **Save** and wait for activation (up to 10 minutes)
5. **Manage Consumer Details** → copy:
   - **Consumer Key** → `SALESFORCE_CLIENT_ID`
   - **Consumer Secret** → `SALESFORCE_CLIENT_SECRET`

### Configure Client Credentials Flow

1. **Manage → Edit Policies**
2. Under **Client Credentials Flow:**
   - **Run As:** select a user with appropriate permissions
   - This user's email → `SALESFORCE_CLIENT_EMAIL`
3. Save

## 2. Get the Agentforce Agent ID

1. **Setup → Agentforce Studio** (or Einstein Agents)
2. Open your agent
3. The Agent ID is in the URL: `...agent/<AGENT_ID>/...`
   - Or use the API: query `SELECT Id, DeveloperName FROM BotDefinition`
4. Set as `SALESFORCE_AGENT_ID`

## 3. Get the Salesforce Server URL

Your Salesforce instance URL, typically:
- `https://yourorg.my.salesforce.com`
- For sandboxes: `https://yourorg--sandbox.sandbox.my.salesforce.com`

Set as `SALESFORCE_SERVER_URL`

## 4. Configure the Delegate Endpoint (Agentforce → A2A)

If you want Agentforce to delegate tasks to external A2A agents:

### 4.1 Create a Named Credential

1. **Setup → Named Credentials → New**
2. Configure:
   - **Label:** `A2A Proxy`
   - **URL:** `https://your-proxy.herokuapp.com`
   - **Authentication Protocol:** Custom Header
   - **Header Name:** `X-API-Key`
   - **Header Value:** your `DELEGATE_API_KEY`

### 4.2 Create an External Service

1. **Setup → External Services → New**
2. **From API Specification:**
   - Upload the `openapi/agentforce-action.yaml` file from this project
   - Or paste the URL to the hosted OpenAPI spec
3. **Named Credential:** select `A2A Proxy`
4. Save and confirm the operations are imported

### 4.3 Create an Agent Action

1. **Setup → Agentforce Studio → Your Agent → Actions**
2. **+ New Action → External Service**
3. Select the `delegateTask` operation
4. Configure:
   - **Label:** `Delegate to External Agent`
   - **Agent Instructions:** Describe when the agent should use this action
   - Map the input/output fields
5. **Activate** the action

## 5. Test the Setup

### Test Inbound (A2A → Agentforce)

```bash
# Discover the agent
curl https://your-proxy.herokuapp.com/.well-known/agent-card.json | jq

# Send a message
curl -X POST https://your-proxy.herokuapp.com/a2a \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tasks/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [{"type": "text", "text": "Hello, what can you help me with?"}]
      }
    }
  }'
```

### Test Outbound (Agentforce → A2A)

```bash
# List available external agents
curl https://your-proxy.herokuapp.com/api/v1/agents \
  -H "X-API-Key: YOUR_DELEGATE_API_KEY" | jq

# Delegate a task
curl -X POST https://your-proxy.herokuapp.com/api/v1/delegate \
  -H "X-API-Key: YOUR_DELEGATE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentAlias": "weather-agent",
    "message": "What is the weather in Paris?"
  }'
```

## Troubleshooting

| Issue | Solution |
|---|---|
| `INVALID_SESSION_ID` | Check your Connected App scopes and Client Credentials Run As user |
| `INSUFFICIENT_ACCESS` | Ensure the Run As user has Agentforce permissions |
| `401 Unauthorized` on proxy | Verify your `API_KEY` or `DELEGATE_API_KEY` matches |
| Agent not responding | Check the Agentforce agent is activated in Agentforce Studio |
| Session timeout | Sessions expire after 30 minutes by default; adjust `SESSION_TTL_SECONDS` |
