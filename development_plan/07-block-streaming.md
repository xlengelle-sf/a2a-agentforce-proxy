# Block 7 — Streaming Support (SSE in Both Directions)

## Goal

Real-time streaming responses in both directions using Server-Sent Events (SSE), with proper handling of Heroku's 30-second timeout.

## Dependencies

- Block 4 (Inbound A2A Server — extend with streaming)
- Block 6 (Delegate Endpoint — extend with streaming)

## Tasks

### 7.1 Implement Agentforce Streaming Client

**File:** `src/agentforce/client/streaming.ts`

Parse Agentforce SSE events from the streaming endpoint.

```typescript
async function* streamAgentforceMessages(
  token: string,
  sessionId: string,
  sequenceId: number,
  text: string
): AsyncGenerator<AgentforceStreamEvent> {
  // POST to /sessions/{sessionId}/messages/stream
  // Accept: text/event-stream
  // Parse SSE events: ProgressIndicator, TextChunk, Inform, EndOfTurn
  // Yield typed events
}
```

**Key implementation detail:** Use Node.js native `fetch()` (available in Node 20) or `undici` to make the request and parse the response stream as SSE. The response body is a `ReadableStream` that emits SSE-formatted lines.

**SSE Parsing:**
- Lines starting with `event:` define the event type
- Lines starting with `data:` contain the JSON payload
- Empty lines (`\n\n`) separate events
- Lines starting with `:` are comments (heartbeats)

**Agentforce SSE Event Types:**

```typescript
type AgentforceStreamEvent =
  | { type: 'ProgressIndicator'; data: { text?: string } }
  | { type: 'TextChunk'; data: { text: string } }
  | { type: 'Inform'; data: { message: string; citedReferences?: any[] } }
  | { type: 'EndOfTurn'; data: {} }
  | { type: 'ValidationFailureChunk'; data: { message: string } };
```

**IMPORTANT:** The exact payload structure of these events needs to be confirmed by testing against a live Agentforce instance. The types above are best guesses based on documentation. Block 2's test script should be extended to capture raw SSE events for confirmation.

### 7.2 Implement Streaming Bridge

**File:** `src/translation/streaming-bridge.ts`

Translate between Agentforce SSE events and A2A SSE events.

```typescript
async function* bridgeAgentforceToA2A(
  agentforceStream: AsyncGenerator<AgentforceStreamEvent>,
  taskId: string,
  contextId: string
): AsyncGenerator<A2AStreamEvent> {
  // ProgressIndicator → TaskStatusUpdateEvent { state: 'working' }
  // TextChunk → TaskArtifactUpdateEvent { artifact: { parts: [text], append: true } }
  // Inform → TaskArtifactUpdateEvent { artifact: { parts: [text], lastChunk: true } }
  // EndOfTurn → TaskStatusUpdateEvent { state: 'completed', final: true }
}
```

**A2A SSE Event Format:**
```
event: status
data: {"jsonrpc":"2.0","id":"req-1","result":{"id":"task-1","status":{"state":"working"},"final":false}}

event: artifact
data: {"jsonrpc":"2.0","id":"req-1","result":{"id":"task-1","artifact":{"parts":[{"type":"text","text":"chunk"}],"index":0,"append":true}}}

event: status
data: {"jsonrpc":"2.0","id":"req-1","result":{"id":"task-1","status":{"state":"completed"},"final":true}}
```

### 7.3 Implement Inbound Streaming Handler

**File:** `src/a2a/server/streaming.ts`

Handle `tasks/sendSubscribe` method via SSE response.

```typescript
async function handleStreamRequest(req: Request, res: Response): Promise<void> {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send initial heartbeat immediately (Heroku 30s timeout)
  res.write(':heartbeat\n\n');

  // Same setup as handleSendTask: validate, translate, session lookup
  // ...

  // Start Agentforce streaming
  const agentforceStream = streamAgentforceMessages(token, sessionId, seqId, text);

  // Bridge to A2A events
  const a2aStream = bridgeAgentforceToA2A(agentforceStream, taskId, contextId);

  // Write events to response
  for await (const event of a2aStream) {
    res.write(formatSSE(event));
  }

  // Close connection
  res.end();
}
```

**Route:** Either `POST /a2a` with `method: "tasks/sendSubscribe"` or `POST /a2a/stream`

Both should work — the JSON-RPC handler detects `sendSubscribe` and delegates to the streaming handler.

### 7.4 Implement Heartbeat Mechanism

For long-running Agentforce calls (up to 120s), we need to keep the Heroku connection alive:

```typescript
function startHeartbeat(res: Response, intervalMs: number = 15000): NodeJS.Timeout {
  return setInterval(() => {
    res.write(':heartbeat\n\n');
  }, intervalMs);
}
```

- Start heartbeat after sending initial SSE headers
- Clear heartbeat when the stream ends or on error
- Heroku requires first byte within 30s, then keeps alive for 55s of idle time
- 15s interval ensures we're well within limits

### 7.5 Handle Client Disconnection

```typescript
req.on('close', () => {
  clearInterval(heartbeat);
  // Cancel the Agentforce stream if possible
  // Log the disconnection
});
```

### 7.6 Outbound Streaming (Delegate Endpoint)

**Extend:** `src/agentforce/action-endpoint/delegate.ts`

Add a streaming variant:

**Route:** `POST /api/v1/delegate/stream`

If the target A2A agent supports streaming (check Agent Card capabilities), use `tasks/sendSubscribe` instead of `tasks/send`. Bridge the A2A agent's SSE stream back as a flat text stream or SSE to Agentforce.

**Note:** Agentforce External Services may not support consuming SSE streams directly. This endpoint is for non-Agentforce callers (web UIs, other services) that need real-time responses from external A2A agents through the proxy. For Agentforce, the synchronous delegate endpoint remains the primary interface.

### 7.7 SSE Utility

**File:** `src/shared/sse.ts`

```typescript
function formatSSE(eventType: string, data: object): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseSSE(raw: string): Array<{ event: string; data: string }> {
  // Parse raw SSE text into event objects
}
```

### 7.8 Write Tests

**Files:**
- `tests/unit/agentforce/streaming.test.ts`
- `tests/unit/translation/streaming-bridge.test.ts`

Test cases:
- Parse Agentforce SSE events correctly
- Bridge Agentforce events to A2A events
- Heartbeat mechanism sends at correct interval
- Client disconnection handled gracefully
- End-to-end streaming with mock Agentforce API

### 7.9 Extend Agentforce Test Script

**Extend:** `scripts/test-agentforce.ts`

Add a `--stream` flag that tests the streaming endpoint and logs all raw SSE events. This is critical for confirming the exact SSE event format.

## Verification

- [ ] `npm test` — all streaming tests pass
- [ ] Agentforce streaming client parses SSE events correctly
- [ ] Streaming bridge translates events correctly
- [ ] Inbound streaming: send `tasks/sendSubscribe`, receive SSE events
- [ ] Heartbeat: SSE connection stays alive for >30 seconds
- [ ] Client disconnect: resources cleaned up properly

**Live test:**
- [ ] Stream a response from Agentforce through the proxy
- [ ] Capture and verify exact Agentforce SSE event format
- [ ] Verify the A2A client receives properly formatted SSE events

## Files Created/Modified

```
src/agentforce/client/
└── streaming.ts                # NEW

src/translation/
└── streaming-bridge.ts         # NEW

src/a2a/server/
└── streaming.ts                # NEW

src/shared/
└── sse.ts                      # NEW

tests/unit/agentforce/
└── streaming.test.ts           # NEW

tests/unit/translation/
└── streaming-bridge.test.ts    # NEW
```
