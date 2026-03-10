# Playwright Web E2E Testing Reference

**Official Documentation**: https://playwright.dev/docs/intro  
**Last Updated**: 2026-02-21

This reference contains official Playwright patterns and best practices relevant to this repo's testing philosophy: **real app, no mocks, stable selectors, auth setup, and CI reliability**.

---

## Table of Contents

1. [Stable Selectors](#stable-selectors)
2. [Authentication Setup](#authentication-setup)
3. [Test Fixtures](#test-fixtures)
4. [CI Configuration](#ci-configuration)
5. [Best Practices](#best-practices)
6. [Page Object Model](#page-object-model)

---

## Stable Selectors

### Priority Order (Official Recommendation)

**Always prefer user-facing attributes over implementation details.**

```typescript
// ✅ BEST: Role-based (accessibility-first)
await page.getByRole("button", { name: "Submit" });
await page.getByRole("heading", { name: "Sign up" });
await page.getByRole("checkbox", { name: "Subscribe" });

// ✅ GOOD: Label-based (forms)
await page.getByLabel("Password");
await page.getByLabel("Email address");

// ✅ GOOD: Text content
await page.getByText("Welcome, John");
await page.getByText(/welcome, [A-Za-z]+$/i); // regex

// ✅ GOOD: Placeholder
await page.getByPlaceholder("name@example.com");

// ✅ GOOD: Alt text (images)
await page.getByAltText("playwright logo");

// ✅ FALLBACK: Test ID (when above don't work)
await page.getByTestId("submit-button");

// ❌ AVOID: CSS/XPath (brittle, breaks on refactor)
await page.locator(".btn-primary"); // BAD
await page.locator("#submit"); // BAD
```

### Custom Test ID Attribute

Configure in `playwright.config.ts`:

```typescript
export default defineConfig({
  use: {
    testIdAttribute: "data-testid", // or 'data-pw', 'data-test', etc.
  },
});
```

### Chaining and Filtering

```typescript
// Filter by text
await page.getByRole("listitem").filter({ hasText: "Product 2" }).getByRole("button", { name: "Add to cart" }).click();

// Filter by child element
await page
  .getByRole("listitem")
  .filter({ has: page.getByRole("heading", { name: "Product 2" }) })
  .getByRole("button", { name: "Add to cart" })
  .click();

// Filter by NOT having text
await expect(page.getByRole("listitem").filter({ hasNotText: "Out of stock" })).toHaveCount(5);
```

### Handling Multiple Matches

```typescript
// ✅ Use .first(), .last(), .nth() when order is stable
await page.getByRole("button").first().click();
await page.getByRole("listitem").nth(2).click();

// ⚠️ Better: make locator more specific
await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
```

---

## Authentication Setup

### Pattern 1: Shared Account (Recommended for Stateless Tests)

**When to use**: Tests don't modify server-side state, can run in parallel with same account.

**Setup file** (`tests/auth.setup.ts`):

```typescript
import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "../playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  await page.goto("https://github.com/login");
  await page.getByLabel("Username or email address").fill("username");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for final URL to ensure cookies are set
  await page.waitForURL("https://github.com/");

  // Or wait for a specific element
  await expect(page.getByRole("button", { name: "View profile" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
```

**Config** (`playwright.config.ts`):

```typescript
export default defineConfig({
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
});
```

**`.gitignore`**:

```
playwright/.auth
```

### Pattern 2: One Account Per Worker (For Tests That Modify State)

**When to use**: Tests modify shared server-side state (settings, data).

**Fixture file** (`playwright/fixtures.ts`):

```typescript
import { test as baseTest, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

export * from "@playwright/test";

export const test = baseTest.extend<{}, { workerStorageState: string }>({
  storageState: ({ workerStorageState }, use) => use(workerStorageState),

  workerStorageState: [
    async ({ browser }, use) => {
      const id = test.info().parallelIndex;
      const fileName = path.resolve(test.info().project.outputDir, `.auth/${id}.json`);

      if (fs.existsSync(fileName)) {
        await use(fileName);
        return;
      }

      const page = await browser.newPage({ storageState: undefined });

      // Acquire unique account (create or use pre-created)
      const account = await acquireAccount(id);

      await page.goto("https://github.com/login");
      await page.getByLabel("Username or email address").fill(account.username);
      await page.getByLabel("Password").fill(account.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("https://github.com/");

      await page.context().storageState({ path: fileName });
      await page.close();
      await use(fileName);
    },
    { scope: "worker" },
  ],
});
```

**Test file**:

```typescript
import { test, expect } from "../playwright/fixtures";

test("test", async ({ page }) => {
  // page is authenticated with worker-specific account
});
```

### Pattern 3: API-Based Auth (Faster)

```typescript
setup("authenticate", async ({ request }) => {
  await request.post("https://github.com/login", {
    form: {
      user: "user",
      password: "password",
    },
  });
  await request.storageState({ path: authFile });
});
```

### Multiple Roles

```typescript
// auth.setup.ts
const adminFile = "playwright/.auth/admin.json";
const userFile = "playwright/.auth/user.json";

setup("authenticate as admin", async ({ page }) => {
  // ... login as admin
  await page.context().storageState({ path: adminFile });
});

setup("authenticate as user", async ({ page }) => {
  // ... login as user
  await page.context().storageState({ path: userFile });
});
```

**Use in tests**:

```typescript
test.use({ storageState: "playwright/.auth/admin.json" });

test("admin test", async ({ page }) => {
  // authenticated as admin
});

test.describe(() => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test("user test", async ({ page }) => {
    // authenticated as user
  });
});
```

---

## Test Fixtures

### Built-in Fixtures

```typescript
test("example", async ({ page, context, browser, request }) => {
  // page: isolated Page for this test
  // context: isolated BrowserContext
  // browser: shared Browser instance
  // request: APIRequestContext for API calls
});
```

### Creating Custom Fixtures

```typescript
import { test as base } from "@playwright/test";
import { TodoPage } from "./todo-page";

type MyFixtures = {
  todoPage: TodoPage;
};

export const test = base.extend<MyFixtures>({
  todoPage: async ({ page }, use) => {
    const todoPage = new TodoPage(page);
    await todoPage.goto();
    await todoPage.addToDo("item1");
    await use(todoPage);
    await todoPage.removeAll();
  },
});
```

### Worker-Scoped Fixtures (Setup Once Per Worker)

```typescript
type Account = { username: string; password: string };

export const test = base.extend<{}, { account: Account }>({
  account: [
    async ({ browser }, use, workerInfo) => {
      const username = "user" + workerInfo.workerIndex;
      const password = "verysecure";

      // Setup account once per worker
      const page = await browser.newPage();
      await page.goto("/signup");
      await page.getByLabel("User Name").fill(username);
      await page.getByLabel("Password").fill(password);
      await page.getByText("Sign up").click();
      await expect(page.getByTestId("result")).toHaveText("Success");
      await page.close();

      await use({ username, password });
    },
    { scope: "worker" },
  ],
});
```

### Automatic Fixtures (Run for Every Test)

```typescript
export const test = base.extend<{ saveLogs: void }>({
  saveLogs: [
    async ({}, use, testInfo) => {
      const logs = [];
      debug.log = (...args) => logs.push(args.map(String).join(""));

      await use();

      if (testInfo.status !== testInfo.expectedStatus) {
        const logFile = testInfo.outputPath("logs.txt");
        await fs.promises.writeFile(logFile, logs.join("\n"), "utf8");
        testInfo.attachments.push({
          name: "logs",
          contentType: "text/plain",
          path: logFile,
        });
      }
    },
    { auto: true },
  ],
});
```

---

## CI Configuration

### GitHub Actions (Basic)

```yaml
name: Playwright Tests
on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: lts/*
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright Browsers
        run: npx playwright install --with-deps
      - name: Run Playwright tests
        run: npx playwright test
      - uses: actions/upload-artifact@v5
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

### GitHub Actions (Sharded)

```yaml
jobs:
  playwright-sharding:
    name: "Playwright Tests (Shard ${{ matrix.shardIndex }}/${{ matrix.shardTotal }})"
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shardIndex: [1, 2, 3, 4]
        shardTotal: [4]
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 20
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright Browsers
        run: npx playwright install --with-deps
      - name: Run Playwright tests
        run: npx playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }} --reporter=blob
      - name: Upload blob report
        uses: actions/upload-artifact@v5
        with:
          name: blob-report-${{ matrix.shardIndex }}
          path: playwright-report/
          retention-days: 5

  merge-reports:
    name: "Merge Playwright Reports"
    runs-on: ubuntu-latest
    needs: [playwright-sharding]
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 20
      - name: Install dependencies
        run: npm ci
      - name: Download blob reports
        uses: actions/download-artifact@v5
        with:
          name: blob-report-
          path: blob-reports/
      - name: Merge reports
        run: npx playwright merge-reports --reporter=html ./blob-reports
      - name: Upload HTML report
        uses: actions/upload-artifact@v5
        with:
          name: playwright-html-report
          path: playwright-report/
          retention-days: 30
```

### Docker Container

```yaml
jobs:
  playwright:
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/playwright:v1.58.2-noble
      options: --user 1001
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: lts/*
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npx playwright test
```

### Config for CI

```typescript
export default defineConfig({
  // Sequential on CI for stability
  workers: process.env.CI ? 1 : undefined,

  // Retry failed tests on CI
  retries: process.env.CI ? 2 : 0,

  // Reporter for CI
  reporter: process.env.CI ? [["html"], ["github"]] : [["html"], ["list"]],

  use: {
    // Trace on first retry
    trace: "on-first-retry",

    // Screenshot on failure
    screenshot: "only-on-failure",
  },
});
```

---

## Best Practices

### 1. Test User-Visible Behavior

```typescript
// ✅ GOOD: Test what users see/do
await page.getByRole("button", { name: "Submit" }).click();
await expect(page.getByText("Success!")).toBeVisible();

// ❌ BAD: Test implementation details
expect(component.state.isSubmitted).toBe(true);
```

### 2. Isolate Tests

```typescript
// ✅ Each test is independent
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await loginAsUser(page);
});

test("test 1", async ({ page }) => {
  // Starts fresh
});

test("test 2", async ({ page }) => {
  // Starts fresh
});
```

### 3. Use Web-First Assertions

```typescript
// ✅ GOOD: Auto-waits and retries
await expect(page.getByText("welcome")).toBeVisible();

// ❌ BAD: Manual assertion, no waiting
expect(await page.getByText("welcome").isVisible()).toBe(true);
```

### 4. Avoid Testing Third-Party Dependencies

```typescript
// ✅ GOOD: Mock external API
await page.route("**/api/external", (route) =>
  route.fulfill({
    status: 200,
    body: JSON.stringify({ data: "test" }),
  }),
);

// ❌ BAD: Test external site
await page.goto("https://external-site.com");
```

### 5. Use Parallelism

```typescript
// Run tests in same file in parallel
test.describe.configure({ mode: "parallel" });

test("test 1", async ({ page }) => {
  /* ... */
});
test("test 2", async ({ page }) => {
  /* ... */
});
```

### 6. Keep Playwright Updated

```bash
npm install -D @playwright/test@latest
npx playwright install --with-deps
```

### 7. Lint Tests

```json
// .eslintrc.json
{
  "rules": {
    "@typescript-eslint/no-floating-promises": "error"
  }
}
```

---

## Page Object Model

### Basic Pattern

```typescript
// pages/LoginPage.ts
import { Page, Locator } from "@playwright/test";

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByLabel("Username");
    this.passwordInput = page.getByLabel("Password");
    this.loginButton = page.getByRole("button", { name: "Login" });
  }

  async goto() {
    await this.page.goto("/login");
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
```

### Usage in Tests

```typescript
import { test, expect } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage";

test("login", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login("user", "pass");

  // Assertions in test, not in page object
  await expect(page).toHaveURL("/dashboard");
});
```

### With Fixtures

```typescript
// fixtures.ts
import { test as base } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage";

type MyFixtures = {
  loginPage: LoginPage;
};

export const test = base.extend<MyFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
});

// test.spec.ts
import { test, expect } from "./fixtures";

test("login", async ({ loginPage, page }) => {
  await loginPage.goto();
  await loginPage.login("user", "pass");
  await expect(page).toHaveURL("/dashboard");
});
```

---

## Quick Reference

### Common Patterns

```typescript
// Navigate
await page.goto("https://example.com");

// Click
await page.getByRole("button", { name: "Submit" }).click();

// Fill input
await page.getByLabel("Email").fill("test@example.com");

// Check checkbox
await page.getByRole("checkbox", { name: "Agree" }).check();

// Select dropdown
await page.getByLabel("Country").selectOption("USA");

// Wait for element
await page.getByText("Success").waitFor();

// Assert visible
await expect(page.getByText("Welcome")).toBeVisible();

// Assert text
await expect(page.getByRole("heading")).toHaveText("Dashboard");

// Assert URL
await expect(page).toHaveURL("/dashboard");

// Assert count
await expect(page.getByRole("listitem")).toHaveCount(3);
```

### Debugging

```bash
# Run with UI
npx playwright test --ui

# Run with debug
npx playwright test --debug

# Run specific test with debug
npx playwright test example.spec.ts:10 --debug

# Generate trace
npx playwright test --trace on

# Show report
npx playwright show-report
```

---

## Official Resources

- **Docs**: https://playwright.dev/docs/intro
- **API**: https://playwright.dev/docs/api/class-playwright
- **Best Practices**: https://playwright.dev/docs/best-practices
- **GitHub**: https://github.com/microsoft/playwright
- **Discord**: https://aka.ms/playwright/discord
