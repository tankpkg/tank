/**
 * OpenAI — agentic function calling loop
 * Model autonomously calls tools until it has enough info
 */
import OpenAI from 'openai';
import { TankClient, createSkillTool } from '@tankpkg/sdk';

const REGISTRY = 'http://localhost:5555';
const SKILL = '@e2etest-019e8fc048/sdk-demo-skill';

async function main() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  OpenAI — Agentic Function Calling        ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  const tank = new TankClient({ registryUrl: REGISTRY });
  const openai = new OpenAI();
  const skillTool = await createSkillTool(tank, SKILL);

  const messages = [
    { role: 'system', content: 'Use tools to read skills. Always read the full skill before answering.' },
    { role: 'user', content: 'What does this skill do? Read everything and summarize.' },
  ];

  let turn = 0;
  while (true) {
    turn++;
    console.log(`── Turn ${turn} ──`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      tools: [skillTool.toOpenAI()],
      messages,
    });

    const choice = response.choices[0];

    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
      messages.push(choice.message);
      for (const call of choice.message.tool_calls) {
        console.log(`  🔧 ${call.function.name}(${call.function.arguments})`);
        const result = await skillTool.execute(JSON.parse(call.function.arguments));
        console.log(`  ✅ success=${result.success}`);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }

    console.log(`\n── Final Answer ──\n${choice.message.content}\n`);
    break;
  }

  console.log(`✅ OpenAI — ${turn} turn(s), fully autonomous`);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
