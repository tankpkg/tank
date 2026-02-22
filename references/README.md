# E2E Testing References

This directory contains curated, actionable references for writing real E2E tests in this repo.

## Philosophy

**ZERO MOCKS. REAL APP. STABLE SELECTORS. RELIABLE CI.**

All references follow this repo's testing philosophy:
- ✅ Real application running end-to-end
- ✅ Real database (Testcontainers/Docker)
- ✅ Real infrastructure
- ✅ Stable, user-facing selectors
- ✅ CI-optimized patterns
- ❌ NO mocks (`vi.fn()`, `jest.mock()`, etc.)
- ❌ NO direct function imports
- ❌ NO brittle CSS selectors

## Quick Start

### New to E2E Testing?
1. Read [test-design-patterns.md](test-design-patterns.md) - **The Mock Trap** section
2. Read [playwright-web.md](playwright-web.md) - Stable selectors + auth setup
3. Pick your test type:
   - Web app? → [playwright-web.md](playwright-web.md)
   - API? → [api-server-testing.md](api-server-testing.md)
   - CLI? → [cli-testing.md](cli-testing.md)

### Writing Tests?
- **Selectors**: [playwright-web.md#stable-selectors](playwright-web.md#stable-selectors)
- **Auth**: [playwright-web.md#authentication-setup](playwright-web.md#authentication-setup)
- **Fixtures**: [playwright-web.md#test-fixtures](playwright-web.md#test-fixtures)
- **Database**: [test-infrastructure.md](test-infrastructure.md)

### Tests Failing?
- **Flaky tests**: [test-reliability.md](test-reliability.md)
- **CI issues**: [ci-cd-integration.md](ci-cd-integration.md)
- **Debugging**: [playwright-web.md#debugging](playwright-web.md#debugging)

## Reference Files

| File | Purpose | When to Use |
|------|---------|-------------|
| [playwright-web.md](playwright-web.md) | **Playwright patterns** - selectors, auth, fixtures, CI | Writing web E2E tests |
| [test-design-patterns.md](test-design-patterns.md) | **The Mock Trap** + real vs fake E2E patterns | Before writing ANY E2E test |
| [api-server-testing.md](api-server-testing.md) | API testing with Supertest + real DB | Testing REST/GraphQL APIs |
| [cli-testing.md](cli-testing.md) | CLI testing with process spawning | Testing CLI tools |
| [test-infrastructure.md](test-infrastructure.md) | Testcontainers, Docker, DB seeding | Setting up test infrastructure |
| [test-reliability.md](test-reliability.md) | Fixing flaky tests, waiting strategies | Tests failing intermittently |
| [ci-cd-integration.md](ci-cd-integration.md) | GitHub Actions, sharding, reporting | Setting up CI pipeline |

## Common Patterns

### Authentication (Playwright)

```typescript
// Setup file: tests/auth.setup.ts
import { test as setup } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/dashboard');
  await page.context().storageState({ path: authFile });
});
```

### Stable Selectors (Playwright)

```typescript
// ✅ BEST: Role-based
await page.getByRole('button', { name: 'Submit' });

// ✅ GOOD: Label-based
await page.getByLabel('Email address');

// ✅ FALLBACK: Test ID
await page.getByTestId('submit-button');

// ❌ AVOID: CSS/XPath
await page.locator('.btn-primary'); // BAD
```

### Real Database (Testcontainers)

```typescript
import { PostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
  process.env.DATABASE_URL = container.getConnectionUri();
});

afterAll(async () => {
  await container.stop();
});
```

### API Testing (Supertest)

```typescript
import request from 'supertest';
import { app } from '../src/app';

test('POST /api/users', async () => {
  const response = await request(app)
    .post('/api/users')
    .send({ name: 'John', email: 'john@example.com' })
    .expect(201);
  
  expect(response.body).toMatchObject({
    name: 'John',
    email: 'john@example.com',
  });
});
```

### CLI Testing (Process Spawning)

```typescript
import { spawn } from 'child_process';

test('tank --version', async () => {
  const proc = spawn('node', ['bin/tank.js', '--version']);
  
  let stdout = '';
  proc.stdout.on('data', (data) => { stdout += data; });
  
  const exitCode = await new Promise((resolve) => {
    proc.on('close', resolve);
  });
  
  expect(exitCode).toBe(0);
  expect(stdout).toMatch(/\d+\.\d+\.\d+/);
});
```

## Decision Tree

### "What kind of E2E test do I write?"

```
1. Am I using mocks (vi.fn(), jest.mock())?
   → YES: STOP. Delete all mocks. Not E2E.
   → NO: Continue.

2. Am I calling functions directly?
   → YES: STOP. Use HTTP/browser/stdin instead.
   → NO: Continue.

3. What's the public interface?
   → Browser UI: Use Playwright (playwright-web.md)
   → HTTP API: Use Supertest (api-server-testing.md)
   → CLI: Use spawn() (cli-testing.md)
   → Multiple: Combine approaches

4. Do I need a database?
   → YES: Use Testcontainers (test-infrastructure.md)
   → NO: Proceed with tests

5. Are tests flaky?
   → YES: Read test-reliability.md
   → NO: You're done!
```

## Official Sources

All patterns are sourced from:
- **Playwright Official Docs**: https://playwright.dev/docs/intro
- **Testcontainers Docs**: https://testcontainers.com/
- **Supertest GitHub**: https://github.com/ladjs/supertest
- **Community Best Practices**: Curated from production codebases

## Contributing

When adding new references:
1. **Source from official docs** - No blog posts or tutorials
2. **Include actionable examples** - Copy-paste ready code
3. **Follow repo philosophy** - Real app, no mocks, stable selectors
4. **Keep it concise** - Developers need quick answers, not essays

---

**Last Updated**: 2026-02-21  
**Playwright Version**: v1.58.2
