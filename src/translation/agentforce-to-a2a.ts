import type { AgentforceMessageResponse } from '../agentforce/types.js';
import type { A2ATask, A2AArtifact, A2ATaskStatus, A2AMessage, TaskState } from '../a2a/types.js';

/**
 * Convert an Agentforce message response into an A2A Task.
 *
 * Determines the task state heuristically:
 *  - Default: completed
 *  - If the response looks like a question: input-required
 */
export function translateAgentforceResponseToTask(
  response: AgentforceMessageResponse,
  taskId: string,
  contextId: string,
): A2ATask {
  const text =
    response.messages?.[0]?.message ?? '';

  const state = detectTaskState(text);

  const status: A2ATaskStatus = {
    state,
    timestamp: new Date().toISOString(),
  };

  // If input-required, attach a message asking for more info
  if (state === 'input-required') {
    status.message = {
      role: 'agent',
      parts: [{ type: 'text', text }],
    };
  }

  const artifacts: A2AArtifact[] = [
    {
      name: 'response',
      parts: [{ type: 'text', text }],
      index: 0,
    },
  ];

  return { id: taskId, contextId, status, artifacts };
}

/**
 * Build an A2A Task for a failed request.
 */
export function buildFailedTask(
  taskId: string,
  contextId: string,
  errorMessage: string,
): A2ATask {
  return {
    id: taskId,
    contextId,
    status: {
      state: 'failed',
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: errorMessage }],
      },
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Build an A2A Task in canceled state.
 */
export function buildCanceledTask(taskId: string, contextId: string): A2ATask {
  return {
    id: taskId,
    contextId,
    status: {
      state: 'canceled',
      timestamp: new Date().toISOString(),
    },
  };
}

// ─── Outbound helpers (Agentforce → A2A direction) ──────────────────────────

/**
 * Create an A2A Message from simple text (used by delegate endpoint).
 */
export function createA2AMessageFromText(text: string): A2AMessage {
  return {
    role: 'user',
    parts: [{ type: 'text', text }],
  };
}

/**
 * Extract concatenated text from an A2A Task's artifacts.
 * Iterates all artifacts, finds TextParts, and joins them.
 */
export function extractTextFromA2ATask(task: A2ATask): string {
  if (!task.artifacts?.length) {
    // Fall back to status message if no artifacts
    if (task.status.message?.parts) {
      return task.status.message.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n\n');
    }
    return '';
  }

  const texts: string[] = [];

  for (const artifact of task.artifacts) {
    for (const part of artifact.parts) {
      if (part.type === 'text') {
        texts.push(part.text);
      }
    }
  }

  return texts.join('\n\n');
}

// ─── Heuristics ────────────────────────────────────────────────────────────

const QUESTION_SIGNALS = [
  /\?\s*$/,                     // ends with "?"
  /could you (please )?/i,
  /can you (please )?/i,
  /what (is|are|would|do)/i,
  /which one/i,
  /please (provide|specify|clarify|confirm|select|choose)/i,
  /i need (more|additional) (info|information|details)/i,
  /let me know/i,
];

function detectTaskState(text: string): TaskState {
  if (!text) return 'completed';

  for (const signal of QUESTION_SIGNALS) {
    if (signal.test(text)) {
      return 'input-required';
    }
  }

  return 'completed';
}
