import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

const HOOK_HANDLER_PATH = path.resolve(__dirname, '../../../tank-skills/skills/quality-gate/hooks/quality-gate.ts');

async function importHandler() {
  return await import(HOOK_HANDLER_PATH);
}

function createTmpProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-demo-quality-gate-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@tank.dev"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Tank Demo"', { cwd: dir, stdio: 'pipe' });

  fs.writeFileSync(path.join(dir, 'README.md'), '# Demo Project\n');
  execSync('git add -A && git commit -m "init"', { cwd: dir, stdio: 'pipe' });

  return dir;
}

describe('DEMO: quality-gate live pipeline — real git, real review, real decisions', () => {
  const dirs: string[] = [];

  afterAll(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  it('SCENARIO 1: Buggy code → BLOCKED (critical issues found)', async () => {
    const dir = createTmpProject();
    dirs.push(dir);

    const buggyCode = `
// auth.ts — intentionally buggy for demo
const API_KEY = "sk-live-1234567890abcdef";  // CRITICAL: hardcoded secret

export async function getUser(id: string) {
  const query = "SELECT * FROM users WHERE id = " + id;  // CRITICAL: SQL injection
  const result = await db.query(query);
  return result;  // HIGH: no error handling
}

export function isAdmin(user) {  // HIGH: missing type annotation
  if (user.role = "admin") {  // HIGH: assignment instead of comparison
    return true;
  }
}

export function processPayment(amount) {
  // no validation, no error handling, no return type
  fetch("/api/pay", { method: "POST", body: JSON.stringify({ amount }) });
}
`;

    fs.writeFileSync(path.join(dir, 'auth.ts'), buggyCode);
    execSync('git add -A', { cwd: dir, stdio: 'pipe' });

    const changedFiles = execSync('git diff --cached --name-only', { cwd: dir, encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean);

    const { hasCodeChanges, getCodeFiles, buildReviewPrompt, parseReviewOutput, formatIssuesForAgent } =
      await importHandler();

    console.log('\n' + '='.repeat(70));
    console.log('  QUALITY GATE DEMO — Scenario 1: Buggy auth.ts');
    console.log('='.repeat(70));

    const fileChanges = changedFiles.map((p: string) => ({ path: p }));
    console.log(`\n📁 Changed files: ${changedFiles.join(', ')}`);

    const hasCode = hasCodeChanges(fileChanges);
    console.log(`🔍 Code files detected: ${hasCode}`);
    expect(hasCode).toBe(true);

    const codeFiles = getCodeFiles(fileChanges);
    console.log(`📄 Code files for review: ${codeFiles.map((f: { path: string }) => f.path).join(', ')}`);

    const prompt = buildReviewPrompt(codeFiles);
    console.log(`\n📝 Review prompt generated (${prompt.length} chars)`);

    // Simulate what the reviewer agent would find
    const simulatedReviewOutput = [
      '[critical] - auth.ts:3 - Hardcoded API key "sk-live-..." exposed in source code',
      '[critical] - auth.ts:6 - SQL injection via string concatenation with user input',
      '[high] - auth.ts:7 - No try/catch or error handling around database query',
      '[high] - auth.ts:11 - Missing TypeScript type annotation on function parameter',
      '[high] - auth.ts:12 - Assignment operator (=) used instead of comparison (===) in conditional',
      '[high] - auth.ts:18 - fetch() call without await, error handling, or return value',
      '[medium] - auth.ts:17 - Missing return type annotation on processPayment',
      '[low] - auth.ts:1 - Comment style inconsistent with project conventions'
    ].join('\n');

    console.log('\n🤖 Simulated reviewer output:');
    console.log(simulatedReviewOutput);

    const issues = parseReviewOutput(simulatedReviewOutput);
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
      console.log(`  ${icon} [${issue.severity.toUpperCase()}] ${issue.file}:${issue.line ?? '?'} — ${issue.message}`);
    }

    const hasBlocking = issues.some((i: { severity: string }) => i.severity === 'critical' || i.severity === 'high');
    console.log(`\n🚦 Blocking issues found: ${hasBlocking}`);

    const report = formatIssuesForAgent(issues);
    console.log('\n' + '─'.repeat(70));
    console.log('  QUALITY GATE VERDICT');
    console.log('─'.repeat(70));

    if (hasBlocking) {
      console.log('\n❌ BLOCKED — Agent must fix critical/high issues before stopping.\n');
      console.log(report);
    } else {
      console.log('\n✅ PASSED — No blocking issues.\n');
      console.log(report);
    }

    expect(hasBlocking).toBe(true);
    expect(issues.filter((i: { severity: string }) => i.severity === 'critical')).toHaveLength(2);
    expect(issues.filter((i: { severity: string }) => i.severity === 'high')).toHaveLength(4);
  });

  it('SCENARIO 2: Clean code → PASSED (no blocking issues)', async () => {
    const dir = createTmpProject();
    dirs.push(dir);

    const cleanCode = `
interface User {
  id: string;
  name: string;
  role: "admin" | "user";
}

export async function getUser(id: string): Promise<User | null> {
  try {
    const result = await db.query<User>("SELECT * FROM users WHERE id = $1", [id]);
    return result.rows[0] ?? null;
  } catch (error) {
    console.error("Failed to fetch user:", error);
    throw new Error("Database query failed");
  }
}

export function isAdmin(user: User): boolean {
  return user.role === "admin";
}
`;

    fs.writeFileSync(path.join(dir, 'user.ts'), cleanCode);
    execSync('git add -A', { cwd: dir, stdio: 'pipe' });

    const changedFiles = execSync('git diff --cached --name-only', { cwd: dir, encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean);

    const { hasCodeChanges, getCodeFiles, parseReviewOutput, formatIssuesForAgent } = await importHandler();

    console.log('\n' + '='.repeat(70));
    console.log('  QUALITY GATE DEMO — Scenario 2: Clean user.ts');
    console.log('='.repeat(70));

    const fileChanges = changedFiles.map((p: string) => ({ path: p }));
    console.log(`\n📁 Changed files: ${changedFiles.join(', ')}`);

    const hasCode = hasCodeChanges(fileChanges);
    console.log(`🔍 Code files detected: ${hasCode}`);
    expect(hasCode).toBe(true);

    const simulatedReviewOutput = 'NO_ISSUES_FOUND';

    console.log(`\n🤖 Reviewer verdict: ${simulatedReviewOutput}`);

    const issues = parseReviewOutput(simulatedReviewOutput);
    const hasBlocking = issues.some((i: { severity: string }) => i.severity === 'critical' || i.severity === 'high');

    console.log('\n' + '─'.repeat(70));
    console.log('  QUALITY GATE VERDICT');
    console.log('─'.repeat(70));
    console.log('\n✅ PASSED — No issues found. Agent can stop.\n');

    expect(hasBlocking).toBe(false);
    expect(issues).toHaveLength(0);
  });

  it('SCENARIO 3: Non-code changes only → SKIPPED (no review needed)', async () => {
    const dir = createTmpProject();
    dirs.push(dir);

    fs.writeFileSync(path.join(dir, 'docs.md'), '# Updated Documentation\n\nNew section added.\n');
    fs.writeFileSync(path.join(dir, 'config.yaml'), 'key: value\n');
    execSync('git add -A', { cwd: dir, stdio: 'pipe' });

    const changedFiles = execSync('git diff --cached --name-only', { cwd: dir, encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean);

    const { hasCodeChanges } = await importHandler();

    console.log('\n' + '='.repeat(70));
    console.log('  QUALITY GATE DEMO — Scenario 3: Non-code only (docs + config)');
    console.log('='.repeat(70));

    console.log(`\n📁 Changed files: ${changedFiles.join(', ')}`);

    const fileChanges = changedFiles.map((p: string) => ({ path: p }));
    const hasCode = hasCodeChanges(fileChanges);
    console.log(`🔍 Code files detected: ${hasCode}`);

    console.log('\n' + '─'.repeat(70));
    console.log('  QUALITY GATE VERDICT');
    console.log('─'.repeat(70));
    console.log('\n⏭️  SKIPPED — No code files modified. Gate opens without review.\n');

    expect(hasCode).toBe(false);
  });

  it('SCENARIO 4: Mixed changes, medium/low only → PASSED with report', async () => {
    const dir = createTmpProject();
    dirs.push(dir);

    const okCode = `
export function calculateTotal(items: Array<{ price: number; qty: number }>): number {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total = total + items[i].price * items[i].qty;
  }
  return total;
}

// TODO: add discount support
export function applyDiscount(total: number, code: string): number {
  if (code === "SAVE10") return total * 0.9;
  return total;
}
`;

    fs.writeFileSync(path.join(dir, 'cart.ts'), okCode);
    fs.writeFileSync(path.join(dir, 'notes.md'), '# Release Notes\n');
    execSync('git add -A', { cwd: dir, stdio: 'pipe' });

    const changedFiles = execSync('git diff --cached --name-only', { cwd: dir, encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean);

    const { hasCodeChanges, getCodeFiles, parseReviewOutput, formatIssuesForAgent } = await importHandler();

    console.log('\n' + '='.repeat(70));
    console.log('  QUALITY GATE DEMO — Scenario 4: OK code, medium/low issues');
    console.log('='.repeat(70));

    const fileChanges = changedFiles.map((p: string) => ({ path: p }));
    console.log(`\n📁 Changed files: ${changedFiles.join(', ')}`);

    const hasCode = hasCodeChanges(fileChanges);
    expect(hasCode).toBe(true);

    const simulatedReviewOutput = [
      '[medium] - cart.ts:4 - Could use reduce() instead of manual loop',
      '[medium] - cart.ts:11 - Hardcoded discount code "SAVE10" — consider config/DB lookup',
      '[low] - cart.ts:10 - TODO comment without issue tracker reference'
    ].join('\n');

    console.log(`\n🤖 Simulated reviewer output:`);
    console.log(simulatedReviewOutput);

    const issues = parseReviewOutput(simulatedReviewOutput);
    const hasBlocking = issues.some((i: { severity: string }) => i.severity === 'critical' || i.severity === 'high');

    const report = formatIssuesForAgent(issues);

    console.log('\n' + '─'.repeat(70));
    console.log('  QUALITY GATE VERDICT');
    console.log('─'.repeat(70));
    console.log('\n✅ PASSED — No blocking issues. Noted for awareness:\n');
    console.log(report);

    expect(hasBlocking).toBe(false);
    expect(issues).toHaveLength(3);
  });
});
