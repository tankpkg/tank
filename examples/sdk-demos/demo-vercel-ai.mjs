import { generateText, tool, jsonSchema } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { TankClient, createSkillTool } from '@tankpkg/sdk';

const REGISTRY = 'http://localhost:5555';
const SKILL = '@e2etest-019e8fc048/sdk-demo-skill';

async function main() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  Vercel AI SDK — Agentic Tool Use Demo   ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  const client = new TankClient({ registryUrl: REGISTRY });
  const openai = createOpenAI();
  const skillTool = await createSkillTool(client, SKILL);

  const tankTool = tool({
    description: skillTool.description,
    parameters: jsonSchema({
      type: 'object',
      required: ['action'],
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['read', 'list', 'read_all'] },
        path: { type: ['string', 'null'] },
      },
      strict: true,
    }),
    execute: async (args) => skillTool.execute(args),
  });

  const { text, steps } = await generateText({
    model: openai.responses('gpt-4o-mini'),
    tools: { [skillTool.name]: tankTool },
    maxSteps: 5,
    system: 'Use the available tool to read skills and answer questions.',
    prompt: 'What does this skill do? Read everything and summarize.',
  });

  console.log(`Completed in ${steps.length} step(s):\n`);
  for (const [i, step] of steps.entries()) {
    console.log(`  Step ${i + 1}:`);
    if (step.toolCalls?.length) {
      for (const call of step.toolCalls) {
        console.log(`    🔧 ${call.toolName}(${JSON.stringify(call.args)})`);
      }
    }
    if (step.text) console.log(`    💬 ${step.text.slice(0, 80)}...`);
  }

  console.log(`\n── Final Answer ──\n${text}\n`);
  console.log('✅ Vercel AI SDK — maxSteps handled the full agentic loop');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
