import type { AgentforceStreamEvent } from '../agentforce/types.js';
import type { A2AStreamEvent } from '../a2a/types.js';

/**
 * Bridge Agentforce SSE events to A2A SSE events.
 *
 * Translation:
 *   ProgressIndicator → TaskStatusUpdateEvent { state: 'working' }
 *   TextChunk         → TaskArtifactUpdateEvent { append: true }
 *   Inform            → TaskArtifactUpdateEvent { lastChunk: true }
 *   EndOfTurn         → TaskStatusUpdateEvent { state: 'completed', final: true }
 *   ValidationFailureChunk → TaskStatusUpdateEvent { state: 'failed', final: true }
 */
export async function* bridgeAgentforceToA2A(
  agentforceStream: AsyncGenerator<AgentforceStreamEvent>,
  taskId: string,
  contextId: string,
): AsyncGenerator<A2AStreamEvent> {
  let artifactIndex = 0;

  for await (const event of agentforceStream) {
    switch (event.type) {
      case 'ProgressIndicator':
        yield {
          type: 'status',
          data: {
            id: taskId,
            status: {
              state: 'working',
              timestamp: new Date().toISOString(),
            },
            final: false,
          },
        };
        break;

      case 'TextChunk':
        yield {
          type: 'artifact',
          data: {
            id: taskId,
            artifact: {
              parts: [{ type: 'text', text: event.data.text }],
              index: artifactIndex,
              append: true,
            },
          },
        };
        break;

      case 'Inform':
        yield {
          type: 'artifact',
          data: {
            id: taskId,
            artifact: {
              parts: [{ type: 'text', text: event.data.message }],
              index: artifactIndex,
              lastChunk: true,
            },
          },
        };
        artifactIndex++;
        break;

      case 'EndOfTurn':
        yield {
          type: 'status',
          data: {
            id: taskId,
            status: {
              state: 'completed',
              timestamp: new Date().toISOString(),
            },
            final: true,
          },
        };
        break;

      case 'ValidationFailureChunk':
        yield {
          type: 'status',
          data: {
            id: taskId,
            status: {
              state: 'failed',
              message: {
                role: 'agent',
                parts: [{ type: 'text', text: event.data.message }],
              },
              timestamp: new Date().toISOString(),
            },
            final: true,
          },
        };
        break;
    }
  }
}
