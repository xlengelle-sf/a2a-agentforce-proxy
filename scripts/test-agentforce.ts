/**
 * Live integration test for the Agentforce client.
 *
 * Requires a `.env` file with real Salesforce credentials:
 *   SALESFORCE_SERVER_URL, SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET,
 *   SALESFORCE_AGENT_ID, SALESFORCE_CLIENT_EMAIL
 *
 * Run:  npx tsx scripts/test-agentforce.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { AgentforceClient } from '../src/agentforce/client/index.js';

const required = [
  'SALESFORCE_SERVER_URL',
  'SALESFORCE_CLIENT_ID',
  'SALESFORCE_CLIENT_SECRET',
  'SALESFORCE_AGENT_ID',
  'SALESFORCE_CLIENT_EMAIL',
] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const client = new AgentforceClient({
  serverUrl: process.env.SALESFORCE_SERVER_URL!,
  clientId: process.env.SALESFORCE_CLIENT_ID!,
  clientSecret: process.env.SALESFORCE_CLIENT_SECRET!,
  clientEmail: process.env.SALESFORCE_CLIENT_EMAIL!,
  agentId: process.env.SALESFORCE_AGENT_ID!,
});

async function main() {
  console.log('--- 1. Authenticate ---');
  const token = await client.authenticate();
  console.log(`  Token acquired, instance: ${token.instanceUrl}`);

  console.log('--- 2. Create session ---');
  const sessionId = await client.createSession();
  console.log(`  Session: ${sessionId}`);

  console.log('--- 3. Send message ---');
  const result = await client.sendMessage(sessionId, 1, 'Hello, what can you do?');
  console.log(`  Agent response: ${result.text}`);
  console.log(`  feedbackId: ${result.feedbackId ?? 'n/a'}`);
  console.log(`  planId: ${result.planId ?? 'n/a'}`);

  console.log('--- 4. Send follow-up ---');
  const followUp = await client.sendMessage(sessionId, 2, 'Tell me more.');
  console.log(`  Agent response: ${followUp.text}`);

  console.log('--- 5. Delete session ---');
  await client.deleteSession(sessionId);
  console.log('  Session deleted');

  console.log('\nAll steps completed successfully.');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
