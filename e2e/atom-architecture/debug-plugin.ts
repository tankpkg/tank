#!/usr/bin/env bun
import { createOpencode } from '@opencode-ai/sdk';
import { createOpencodeClient } from '@opencode-ai/sdk/v2';

const CWD = new URL('../../../tank-skills', import.meta.url).pathname;

async function main() {
  console.log('='.repeat(70));
  console.log('  QUALITY GATE DEBUG');
  console.log('='.repeat(70));
  console.log(`\nCWD: ${CWD}`);

  process.chdir(CWD);

  console.log('\n🚀 Starting OpenCode server...');
  const { server } = await createOpencode({ timeout: 15000, port: 14096 });
  console.log(`  Server: ${server.url}`);

  const client = createOpencodeClient({ baseUrl: server.url });

  console.log('📡 Subscribing to event stream...\n');
  const eventResponse = await client.event.subscribe({});
  const eventTypes = new Map<string, number>();

  const streamDone = (async () => {
    for await (const event of eventResponse.stream) {
      const e = event as { type: string; properties?: Record<string, unknown> };
      const t = e.type;
      eventTypes.set(t, (eventTypes.get(t) ?? 0) + 1);

      const time = new Date().toISOString().slice(11, 23);

      if (t === 'session.idle') {
        console.log(`  🔵 [${time}] session.idle — sid: ${e.properties?.sessionID ?? '?'}`);
      } else if (t === 'session.error') {
        console.log(`  🔴 [${time}] session.error — ${JSON.stringify(e.properties)}`);
      } else if (t.startsWith('session.')) {
        console.log(`  🟢 [${time}] ${t}`);
      } else if (t.startsWith('file.')) {
        console.log(`  📁 [${time}] ${t} — ${JSON.stringify(e.properties ?? {})}`);
      } else if (t === 'message.updated' || t === 'message.part.updated') {
        // too noisy — skip
      } else {
        console.log(`  ⚪ [${time}] ${t}`);
      }
    }
  })();

  await new Promise((r) => setTimeout(r, 3000));

  const sessions = await client.session.list();
  console.log(`\n  Server alive — ${sessions.data?.length ?? 0} existing session(s)`);

  console.log('\n📝 Creating session with auto-approve...');
  const session = await client.session.create({
    permission: [{ permission: '*', pattern: '*', action: 'allow' }]
  });
  const sid = session.data!.id;
  console.log(`  Session: ${sid}`);

  console.log('\n💬 Sending prompt...');
  await client.session.prompt({
    sessionID: sid,
    parts: [
      {
        type: 'text' as const,
        text: 'Create a file tmp/auth.ts with: export function login(u: string, p: string) { return db.query("SELECT * FROM users WHERE user=\'" + u + "\' AND pass=\'" + p + "\'"); }'
      }
    ]
  });

  console.log('  Prompt sent, waiting for completion...\n');

  let idleSeen = false;
  const waitForIdle = new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (eventTypes.has('session.idle')) {
        idleSeen = true;
        clearInterval(check);
        setTimeout(resolve, 15000);
      }
    }, 1000);
    setTimeout(() => {
      clearInterval(check);
      resolve();
    }, 90000);
  });
  await waitForIdle;

  if (!idleSeen) {
    console.log('  ⏰ Timed out waiting for session.idle — checking session state...');
    try {
      const sess = await client.session.get({ sessionID: sid });
      console.log('  Session data:', JSON.stringify(sess.data, null, 2).slice(0, 500));
    } catch (err) {
      console.log('  Failed to get session:', err);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  EVENT SUMMARY');
  console.log('='.repeat(70));
  for (const [type, count] of [...eventTypes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}x ${type}`);
  }

  const idleCount = eventTypes.get('session.idle') ?? 0;
  console.log(`\n  session.idle fired: ${idleCount} time(s)`);

  if (idleCount === 0) {
    console.log('  ❌ session.idle never fired — plugin could not trigger');
  } else if (idleCount === 1) {
    console.log('  ⚠️  session.idle fired once — quality-gate may have processed');
  } else {
    console.log('  ✅ session.idle fired multiple times — quality-gate triggered follow-up');
  }

  const errorCount = eventTypes.get('session.error') ?? 0;
  if (errorCount > 0) {
    console.log(`\n  ❌ ${errorCount} error(s) — check logs above`);
  }

  void streamDone;
  server.close();
  console.log('\n✅ Done');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
