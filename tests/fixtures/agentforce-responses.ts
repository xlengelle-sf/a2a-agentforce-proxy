import type { AgentforceMessageResponse } from '../../src/agentforce/types.js';

export const successfulResponse: AgentforceMessageResponse = {
  messages: [
    {
      id: 'msg-1',
      type: 'Text',
      message: 'I found 3 hotels near CDG airport. The best option is Hotel Paris CDG at 120 EUR per night.',
      feedbackId: 'fb-1',
      planId: 'plan-1',
    },
  ],
};

export const questionResponse: AgentforceMessageResponse = {
  messages: [
    {
      id: 'msg-2',
      type: 'Text',
      message: 'Could you please specify your budget range and preferred check-in date?',
    },
  ],
};

export const multiMessageResponse: AgentforceMessageResponse = {
  messages: [
    {
      id: 'msg-3',
      type: 'Text',
      message: 'Here are your options:',
    },
    {
      id: 'msg-4',
      type: 'Text',
      message: '1. Hotel A  2. Hotel B  3. Hotel C',
    },
  ],
};

export const emptyResponse: AgentforceMessageResponse = {
  messages: [],
};
