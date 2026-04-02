/**
 * Anthropic Claude — agentic tool_use loop
 * Claude autonomously decides which tools to call and when to stop
 */
import Anthropic from '@anthropic-ai/sdk';
import { TankClient, createSkillTool } from '@tankpkg/sdk';

const REGISTRY = 'http://localhost:5555';
const SKILL = '@e2etest-019e8fc048/sdk-demo-skill';

async function main() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  Anthropic Claude — Agentic Tool Use      ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  const tank = new TankClient({ registryUrl: REGISTRY });
  const claude = new Anthropic();
  const skillTool = await createSkillTool(tank, SKILL);
  const def = skillTool.toOpenAI();

  // Anthropic uses input_schema (snake_case)
  const tools = [{
    name: def.function.name,
    description: def.function.description,
    input_schema: def.function.parameters,
  }];

  const messages = [
    { role: 'user', content: 'Read the skill and tell me everything about it — content, references, scripts.' },
  ];

  let turn = 0;
  while (true) {
    turn++;
    console.log(`── Turn ${turn} ──`);

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const text = response.content.find(b => b.type === 'text');
      console.log(`\n── Final Answer ──\n${text?.text ?? '(no text)'}\n`);
      break;
    }

    if (response.stop_reason !== 'tool_use') break;

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      console.log(`  🔧 ${block.name}(${JSON.stringify(block.input)})`);
      const result = await skillTool.execute(block.input);
      console.log(`  ✅ success=${result.success}`);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  console.log(`✅ Claude — ${turn} turn(s), fully autonomous`);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
