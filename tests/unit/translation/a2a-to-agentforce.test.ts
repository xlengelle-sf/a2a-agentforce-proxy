import { describe, it, expect } from 'vitest';
import { translateA2AMessageToText } from '../../../src/translation/a2a-to-agentforce.js';
import {
  simpleTextMessage,
  messageWithData,
  messageWithFile,
  multiPartMessage,
} from '../../fixtures/a2a-messages.js';

describe('translateA2AMessageToText', () => {
  it('converts a simple text message', () => {
    const text = translateA2AMessageToText(simpleTextMessage);
    expect(text).toBe('Find me a hotel near CDG airport');
  });

  it('converts a message with data part', () => {
    const text = translateA2AMessageToText(messageWithData);
    expect(text).toContain('Find me a hotel near CDG airport');
    expect(text).toContain('[Structured Data]');
    expect(text).toContain('"budget": 150');
    expect(text).toContain('"currency": "EUR"');
  });

  it('converts a message with file part', () => {
    const text = translateA2AMessageToText(messageWithFile);
    expect(text).toContain('Analyze this document');
    expect(text).toContain('[File: report.pdf, type: application/pdf]');
  });

  it('converts a multi-part message', () => {
    const text = translateA2AMessageToText(multiPartMessage);
    expect(text).toContain('Line 1');
    expect(text).toContain('Line 2');
    expect(text).toContain('[Structured Data]');
    expect(text).toContain('[File: img.png, type: image/png]');
  });

  it('handles file with no name or mime type', () => {
    const text = translateA2AMessageToText({
      role: 'user',
      parts: [{ type: 'file', file: {} }],
    });
    expect(text).toBe('[File: unnamed, type: unknown]');
  });
});
