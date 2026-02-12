/**
 * Live integration test for the A2A client.
 *
 * Usage:
 *   npx tsx scripts/test-a2a-client.ts <agent-url> <message>
 *
 * Example:
 *   npx tsx scripts/test-a2a-client.ts https://my-a2a-agent.herokuapp.com "What is the weather in Paris?"
 */
import { AgentCardResolver } from '../src/a2a/client/agent-card-resolver.js';
import { A2AClient } from '../src/a2a/client/a2a-client.js';

async function main() {
  const [agentUrl, ...messageParts] = process.argv.slice(2);

  if (!agentUrl || messageParts.length === 0) {
    console.error('Usage: npx tsx scripts/test-a2a-client.ts <agent-url> <message>');
    process.exit(1);
  }

  const message = messageParts.join(' ');

  console.log(`\n🔍 Resolving agent card for: ${agentUrl}`);

  const resolver = new AgentCardResolver();
  const card = await resolver.resolve(agentUrl);

  console.log(`✅ Agent: ${card.name}`);
  console.log(`   URL:   ${card.url}`);
  console.log(`   Skills: ${card.skills.map((s) => s.name).join(', ')}`);

  console.log(`\n📤 Sending message: "${message}"`);

  const client = new A2AClient(resolver);
  const task = await client.sendMessage(agentUrl, {
    role: 'user',
    parts: [{ type: 'text', text: message }],
  });

  console.log(`\n📥 Response:`);
  console.log(`   Task ID:    ${task.id}`);
  console.log(`   Context ID: ${task.contextId}`);
  console.log(`   State:      ${task.status.state}`);

  if (task.artifacts?.length) {
    for (const artifact of task.artifacts) {
      for (const part of artifact.parts) {
        if (part.type === 'text') {
          console.log(`   Text:       ${part.text}`);
        }
      }
    }
  }

  console.log('\n✅ Done');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
