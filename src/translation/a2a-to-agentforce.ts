import type { A2AMessage, Part } from '../a2a/types.js';

/**
 * Convert an A2A Message (with multiple Part types) into a single text string
 * suitable for Agentforce's Text message type.
 *
 * Translation rules (from specs):
 *  - TextPart  → concatenated as-is
 *  - DataPart  → serialized JSON, prefixed with [Structured Data]
 *  - FilePart  → placeholder [File: name, type: mimeType]
 */
export function translateA2AMessageToText(message: A2AMessage): string {
  const segments: string[] = [];

  for (const part of message.parts) {
    segments.push(partToText(part));
  }

  return segments.join('\n\n');
}

function partToText(part: Part): string {
  switch (part.type) {
    case 'text':
      return part.text;

    case 'data':
      return `[Structured Data]\n${JSON.stringify(part.data, null, 2)}`;

    case 'file': {
      const name = part.file.name ?? 'unnamed';
      const mime = part.file.mimeType ?? 'unknown';
      return `[File: ${name}, type: ${mime}]`;
    }
  }
}
