#!/usr/bin/env bun
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createOpencode } from '@opencode-ai/sdk';

import {
  buildReviewPrompt,
  type FileChange,
  formatIssuesForAgent,
  getCodeFiles,
  hasCodeChanges,
  parseReviewOutput
} from '../../../tank-skills/skills/quality-gate/hooks/quality-gate';

const BUGGY_CODE = `
const API_KEY = "sk-live-1234567890abcdef";

export async function getUser(id: string) {
  const query = "SELECT * FROM users WHERE id = " + id;
  const result = await db.query(query);
  return result;
}

export function isAdmin(user) {
  if (user.role = "admin") {
    return true;
  }
}
`;

async function main() {
  console.log('='.repeat(70));
  console.log('  QUALITY GATE LIVE DEMO — real OpenCode, real LLM, zero mocks');
  console.log('='.repeat(70));

  // 1. Create temp project with buggy code
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-live-demo-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "demo@tank.dev"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Tank Demo"', { cwd: dir, stdio: 'pipe' });

  fs.writeFileSync(path.join(dir, 'README.md'), '# Demo\n');
  execSync("git add -A && git commit -m 'init'", { cwd: dir, stdio: 'pipe' });

  fs.writeFileSync(path.join(dir, 'auth.ts'), BUGGY_CODE);
  execSync('git add -A', { cwd: dir, stdio: 'pipe' });

  console.log(`\n📁 Temp project: ${dir}`);
  console.log('📄 Created auth.ts with intentional bugs');

  // 2. Detect code changes (real git)
  const changedRaw = execSync('git diff --cached --name-only', { cwd: dir, encoding: 'utf-8' });
  const changedFiles = changedRaw.split('\n').filter(Boolean);
  const fileChanges: FileChange[] = changedFiles.map((p) => ({ path: p }));

  console.log(`\n🔍 Changed files: ${changedFiles.join(', ')}`);

  if (!hasCodeChanges(fileChanges)) {
    console.log('⏭️  No code files — gate skipped');
    cleanup(dir);
    return;
  }

  const codeFiles = getCodeFiles(fileChanges);
  console.log(`📄 Code files for review: ${codeFiles.map((f) => f.path).join(', ')}`);

  // 3. Start OpenCode and create session
  console.log('\n🚀 Starting OpenCode server...');
  const { client, server } = await createOpencode({ config: {} });

  try {
    const session = await client.session.create({
      body: {}
    });
    const sessionId = session.data!.id;
    console.log(`📋 Session created: ${sessionId}`);

    // 4. Send the review prompt via real LLM
    const reviewPrompt = buildReviewPrompt(codeFiles);

    const diffOutput = execSync('git diff --cached', { cwd: dir, encoding: 'utf-8' });

    const fullPrompt = [reviewPrompt, '', 'Here is the actual diff to review:', '```diff', diffOutput, '```'].join(
      '\n'
    );

    console.log('\n🤖 Sending review to LLM...');
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: 'text', text: fullPrompt }]
      }
    });

    // 5. Extract response text
    const parts = (result.data?.parts ?? []) as Array<Record<string, unknown>>;
    const responseText = parts
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text as string)
      .join('\n');

    console.log('\n📝 LLM Review Response:');
    console.log('─'.repeat(70));
    console.log(responseText);
    console.log('─'.repeat(70));

    // 6. Parse and gate
    const issues = parseReviewOutput(responseText);

    if (issues.length === 0 && !responseText.includes('NO_ISSUES_FOUND')) {
      console.log('\n⚠️  Could not parse structured issues from LLM response.');
      console.log('   The raw response is shown above.');
    } else if (issues.length === 0) {
      console.log('\n✅ PASSED — No issues found.');
    } else {
      console.log(`\n📊 Parsed ${issues.length} issues:`);
      for (const issue of issues) {
        const icon =
          issue.severity === 'critical'
            ? '🔴'
            : issue.severity === 'high'
              ? '🟠'
              : issue.severity === 'medium'
                ? '🟡'
                : '⚪';
        console.log(
          `  ${icon} [${issue.severity.toUpperCase()}] ${issue.file}:${issue.line ?? '?'} — ${issue.message}`
        );
      }

      const hasBlocking = issues.some((i) => i.severity === 'critical' || i.severity === 'high');
      const report = formatIssuesForAgent(issues);

      console.log('\n' + '═'.repeat(70));
      console.log('  QUALITY GATE VERDICT');
      console.log('═'.repeat(70));

      if (hasBlocking) {
        console.log('\n❌ BLOCKED — Agent must fix critical/high issues before stopping.\n');
      } else {
        console.log('\n✅ PASSED — No blocking issues.\n');
      }
      console.log(report);
    }
  } finally {
    server.close();
    cleanup(dir);
  }
}

function cleanup(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
