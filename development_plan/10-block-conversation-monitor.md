# Block 10 — Conversation Monitor Tab

## Goal

Real-time iMessage-style visualization of agent conversations with SSE live updates.

## Depends On

Block 9 (event bus, event store, auth, routes)

## Files to Create

| File | Purpose |
|---|---|
| `public/dashboard.html` | Main dashboard with two tabs |
| `public/js/monitor.js` | Conversation monitor: SSE client, message rendering, grouping |
| `tests/integration/dashboard-flow.test.ts` | End-to-end: login → SSE → event delivery |

## Files to Modify

| File | Changes |
|---|---|
| `public/css/dashboard.css` | Add iMessage bubble styles, conversation grouping, latency badges |
| `src/a2a/server/jsonrpc-handler.ts` | Emit ConversationEvent on request + response |
| `src/a2a/server/streaming.ts` | Emit ConversationEvent on streaming request/chunks/status |
| `src/agentforce/action-endpoint/delegate.ts` | Emit ConversationEvent on delegate request + response |
| `src/dashboard/routes.ts` | Add SSE events endpoint |

## Tasks

1. Add event emission hooks in jsonrpc-handler.ts, streaming.ts, delegate.ts
2. Implement SSE endpoint: history on connect, live events, heartbeat
3. Create dashboard.html with tab navigation
4. Create monitor.js with EventSource, message rendering, grouping by contextId
5. Style iMessage bubbles, latency badges, status indicators
6. Write integration test

## Verification

- `npm test` passes
- Send `tasks/send` via curl → message appears in real-time in monitor
- Messages display as iMessage bubbles with correct colors
- Conversations grouped by contextId
- SSE reconnects on connection drop
