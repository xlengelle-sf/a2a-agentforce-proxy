import type { A2AMessage } from '../../src/a2a/types.js';

export const simpleTextMessage: A2AMessage = {
  role: 'user',
  parts: [{ type: 'text', text: 'Find me a hotel near CDG airport' }],
};

export const messageWithData: A2AMessage = {
  role: 'user',
  parts: [
    { type: 'text', text: 'Find me a hotel near CDG airport' },
    { type: 'data', data: { budget: 150, currency: 'EUR' } },
  ],
};

export const messageWithFile: A2AMessage = {
  role: 'user',
  parts: [
    { type: 'text', text: 'Analyze this document' },
    { type: 'file', file: { name: 'report.pdf', mimeType: 'application/pdf' } },
  ],
};

export const multiPartMessage: A2AMessage = {
  role: 'user',
  parts: [
    { type: 'text', text: 'Line 1' },
    { type: 'text', text: 'Line 2' },
    { type: 'data', data: { key: 'value' } },
    { type: 'file', file: { name: 'img.png', mimeType: 'image/png' } },
  ],
};
