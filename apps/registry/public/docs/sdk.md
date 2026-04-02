---
title: TypeScript SDK
description: Official TypeScript SDK for the Tank registry — search, download, read, and install AI agent skills programmatically from Node.js applications.
---

# TypeScript SDK

`@tankpkg/sdk` gives your Node.js application programmatic access to the Tank skill registry. Search skills, read their full content (including references and scripts), download tarballs with integrity verification, and manage the install pipeline — all with typed errors, exponential backoff, and zero manual HTTP.

```bash
npm install @tankpkg/sdk
```

---

## Quick Start

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 120" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="sdk-flow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
  </defs>
  <!-- Your App -->
  <rect x="10" y="30" width="100" height="50" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="60" y="52" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Your App</text>
  <text x="60" y="68" text-anchor="middle" fill="#64748b" font-size="10">Node.js</text>
  <!-- Arrow -->
  <line x1="110" y1="55" x2="150" y2="55" stroke="#64748b" stroke-width="1.5" marker-end="url(#sdk-flow)"/>
  <!-- TankClient -->
  <rect x="155" y="25" width="130" height="60" rx="10" fill="none" stroke="#10b981" stroke-width="2"/>
  <text x="220" y="50" text-anchor="middle" fill="#10b981" font-size="12" font-weight="600">TankClient</text>
  <text x="220" y="68" text-anchor="middle" fill="#64748b" font-size="10">token + retries</text>
  <!-- Arrow -->
  <line x1="285" y1="55" x2="325" y2="55" stroke="#64748b" stroke-width="1.5" marker-end="url(#sdk-flow)"/>
  <!-- Registry API -->
  <rect x="330" y="25" width="130" height="60" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="395" y="50" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Tank Registry</text>
  <text x="395" y="68" text-anchor="middle" fill="#64748b" font-size="10">REST API</text>
  <!-- Arrow to returns -->
  <line x1="460" y1="40" x2="505" y2="18" stroke="#64748b" stroke-width="1.5" marker-end="url(#sdk-flow)"/>
  <line x1="460" y1="50" x2="505" y2="44" stroke="#64748b" stroke-width="1.5" marker-end="url(#sdk-flow)"/>
  <line x1="460" y1="60" x2="505" y2="70" stroke="#64748b" stroke-width="1.5" marker-end="url(#sdk-flow)"/>
  <line x1="460" y1="70" x2="505" y2="96" stroke="#64748b" stroke-width="1.5" marker-end="url(#sdk-flow)"/>
  <!-- Return types -->
  <rect x="510" y="4" width="180" height="26" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="600" y="22" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">SkillContent — SKILL.md + refs</text>
  <rect x="510" y="34" width="180" height="26" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="600" y="52" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">SearchResults</text>
  <rect x="510" y="64" width="180" height="26" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="600" y="82" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">AuditReport</text>
  <rect x="510" y="94" width="180" height="26" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="600" y="112" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">DownloadStream</text>
</svg>
</div>

```typescript
import { TankClient } from "@tankpkg/sdk";

const client = new TankClient();

// Search for skills
const results = await client.search("react");
console.log(results.total, "skills found");

// Read a skill's full content (SKILL.md + references + scripts)
const skill = await client.readSkill("@tank/react");
console.log(skill.content); // SKILL.md text
console.log(skill.references); // { 'hooks.md': '...', 'performance.md': '...' }
console.log(skill.scripts); // { 'setup.sh': '...' }

// Feed to an LLM as system context
const systemPrompt = [
  skill.content,
  ...Object.entries(skill.references).map(([name, text]) => `--- ${name} ---\n${text}`),
].join("\n");
```

---

## Constructor

```typescript
const client = new TankClient(options?)
```

| Option        | Type     | Default                   | Description                                                             |
| ------------- | -------- | ------------------------- | ----------------------------------------------------------------------- |
| `token`       | `string` | auto-discovered           | API key. If omitted, reads `~/.tank/config.json` then `TANK_TOKEN` env. |
| `registryUrl` | `string` | `https://www.tankpkg.dev` | Registry URL. Set for self-hosted/on-prem instances. `http://` allowed. |
| `configDir`   | `string` | `~/.tank`                 | Directory containing `config.json`.                                     |
| `maxRetries`  | `number` | `3`                       | Retry count for 429 and 5xx responses (exponential backoff).            |
| `timeoutMs`   | `number` | `30000`                   | HTTP request timeout in milliseconds.                                   |

**Auth discovery order:** explicit `token` > `TANK_TOKEN` env > `~/.tank/config.json`

```typescript
// Explicit token (CI/server)
const client = new TankClient({ token: "tank_xxx" });

// Self-hosted
const client = new TankClient({ registryUrl: "http://tank.internal:5555" });

// Zero-config (uses CLI auth)
const client = new TankClient();
```

---

## Skill Content

The most important methods for AI agent integrations. These let you load a skill's full content — SKILL.md plus all reference files and scripts — for use as LLM context.

### `readSkill(name, version?)`

Loads the complete skill content in a single call. Returns SKILL.md text, all reference files, all scripts, and the full file list.

```typescript
const skill = await client.readSkill("@tank/react");
```

**Returns: `SkillContent`**

| Field        | Type                     | Description                                                      |
| ------------ | ------------------------ | ---------------------------------------------------------------- |
| `name`       | `string`                 | Skill name                                                       |
| `version`    | `string`                 | Resolved version                                                 |
| `content`    | `string`                 | SKILL.md text                                                    |
| `references` | `Record<string, string>` | Reference files keyed by filename (e.g. `{ 'hooks.md': '...' }`) |
| `scripts`    | `Record<string, string>` | Script files keyed by filename (e.g. `{ 'setup.sh': '...' }`)    |
| `files`      | `string[]`               | All file paths in the package                                    |

### `listFiles(name, version?)`

Lists all files in a skill package.

```typescript
const files = await client.listFiles("@tank/react");
// ['SKILL.md', 'references/hooks.md', 'references/performance.md', 'scripts/setup.sh', 'skills.json']
```

### `readFile(name, version, path)`

Reads a single file from a skill package.

```typescript
const content = await client.readFile("@tank/react", "2.2.0", "references/hooks.md");
```

> Path traversal (`..`), absolute paths, and backslashes are rejected with `TankNetworkError`.

---

## Discovery

### `search(query, options?)`

```typescript
const results = await client.search("typescript", { page: 1, limit: 10 });
```

**Returns:** `{ results: SearchResult[], total: number, page: number, limit: number }`

### `info(name)`

Returns full metadata for a skill.

```typescript
const info = await client.info("@tank/react");
console.log(info.latestVersion); // '2.2.0'
console.log(info.downloads); // 1234
console.log(info.publisher); // { name: 'Tank Bot' }
```

### `versions(name)`

Lists all published versions with audit scores.

```typescript
const result = await client.versions("@tank/react");
for (const v of result.versions) {
  console.log(v.version, v.auditScore, v.publishedAt);
}
```

---

## Download

### `download(name, version, options?)`

Downloads a skill tarball. Three modes:

```typescript
// Stream (default) — returns ReadableStream
const stream = await client.download("@tank/react", "2.2.0");

// Buffer — returns Buffer, integrity verified
const buffer = await client.download("@tank/react", "2.2.0", { buffer: true });

// Disk — writes to directory, integrity verified
await client.download("@tank/react", "2.2.0", { dest: "./skills/" });
```

All modes verify SHA-512 integrity when the registry provides a hash. Download size is capped at 100MB with streaming enforcement.

---

## Security & Audit

### `audit(name, version?)`

Returns the full security analysis for a skill version.

```typescript
const result = await client.audit("@tank/react");
console.log(result.auditScore); // 9.5
console.log(result.scanFindings); // [{ stage: 'static', severity: 'low', ... }]
```

### `permissions(name, version?)`

Returns the declared permission set.

```typescript
const perms = await client.permissions("@tank/react");
// { network: { outbound: ['*.api.com'] }, filesystem: { read: ['./data/**'] }, subprocess: false }
```

---

## Auth

### `whoami()`

Returns user info if authenticated, `null` otherwise.

```typescript
const user = await client.whoami();
if (user) {
  console.log(user.userId, user.name, user.email);
}
```

---

## Stars

```typescript
// Get star count
const { count, isStarred } = await client.getStarCount("@tank/react");

// Star/unstar (requires session auth)
await client.star("@tank/react");
await client.unstar("@tank/react");
```

> Star and unstar require session-based authentication (browser cookies), not API keys. Use `getStarCount()` with API key auth.

---

## Error Handling

All errors extend `TankError`. Catch specific types for programmatic handling:

```typescript
import { TankClient, TankNotFoundError, TankAuthError } from "@tankpkg/sdk";

try {
  await client.info("@acme/missing");
} catch (e) {
  if (e instanceof TankNotFoundError) {
    console.log(e.status); // 404
    console.log(e.skillName); // '@acme/missing'
  }
}
```

| Error Class           | HTTP Status | When                                  |
| --------------------- | ----------- | ------------------------------------- |
| `TankAuthError`       | 401         | Invalid or missing token              |
| `TankNotFoundError`   | 404         | Skill or file not found               |
| `TankPermissionError` | 403         | Insufficient permissions              |
| `TankNetworkError`    | —           | Connection failure, timeout, redirect |
| `TankIntegrityError`  | —           | SHA-512 hash mismatch                 |
| `TankConflictError`   | 409         | Dependency resolution conflict        |

All errors include `status`, `message`, and `cause` (for network errors).

---

## Full Example: Load Skill into OpenAI

```typescript
import { TankClient } from "@tankpkg/sdk";
import OpenAI from "openai";

const tank = new TankClient();
const openai = new OpenAI();

// 1. Load skill with all references
const skill = await tank.readSkill("@tank/react");

// 2. Build system prompt
const systemPrompt = [
  skill.content,
  ...Object.entries(skill.references).map(([name, text]) => `\n--- Reference: ${name} ---\n${text}`),
].join("\n");

// 3. Use as LLM context
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: "How should I handle data fetching in React?" },
  ],
});
```

---

## Tool Generator

Generate framework-agnostic tool definitions from skills. The generated tools work with OpenAI function calling, Anthropic tool use, MCP, LangChain, CrewAI, and any framework that consumes JSON Schema tool definitions.

<svg viewBox="0 0 780 220" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="sdk-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="#64748b"/>
    </marker>
  </defs>
  <!-- Title -->
  <text x="390" y="22" text-anchor="middle" fill="currentColor" font-size="14" font-weight="600">Tool Generation Flow</text>
  <!-- Registry -->
  <rect x="20" y="55" width="130" height="70" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="85" y="82" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Tank Registry</text>
  <text x="85" y="100" text-anchor="middle" fill="#64748b" font-size="10">SKILL.md + refs</text>
  <!-- Arrow -->
  <line x1="150" y1="90" x2="195" y2="90" stroke="#64748b" stroke-width="1.5" marker-end="url(#sdk-arrow)"/>
  <text x="172" y="82" text-anchor="middle" fill="#64748b" font-size="9">fetch</text>
  <!-- createSkillTool -->
  <rect x="200" y="45" width="170" height="90" rx="10" fill="none" stroke="#10b981" stroke-width="2"/>
  <text x="285" y="72" text-anchor="middle" fill="#10b981" font-size="12" font-weight="600">createSkillTool()</text>
  <text x="285" y="92" text-anchor="middle" fill="currentColor" font-size="10">→ name, description</text>
  <text x="285" y="108" text-anchor="middle" fill="currentColor" font-size="10">→ inputSchema</text>
  <text x="285" y="124" text-anchor="middle" fill="currentColor" font-size="10">→ execute(action)</text>
  <!-- Output arrows -->
  <line x1="370" y1="68" x2="460" y2="55" stroke="#64748b" stroke-width="1.5" marker-end="url(#sdk-arrow)"/>
  <line x1="370" y1="90" x2="460" y2="90" stroke="#64748b" stroke-width="1.5" marker-end="url(#sdk-arrow)"/>
  <line x1="370" y1="112" x2="460" y2="125" stroke="#64748b" stroke-width="1.5" marker-end="url(#sdk-arrow)"/>
  <line x1="370" y1="125" x2="460" y2="160" stroke="#64748b" stroke-width="1.5" marker-end="url(#sdk-arrow)"/>
  <!-- .toOpenAI() -->
  <rect x="465" y="35" width="140" height="35" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="535" y="57" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">.toOpenAI()</text>
  <!-- .toMCP() -->
  <rect x="465" y="77" width="140" height="35" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="535" y="99" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">.toMCP()</text>
  <!-- .execute() -->
  <rect x="465" y="119" width="140" height="35" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="535" y="141" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">.execute(action)</text>
  <!-- Anthropic/LangChain -->
  <rect x="465" y="161" width="140" height="35" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="535" y="183" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">LangChain / CrewAI</text>
  <!-- Actions legend -->
  <rect x="630" y="77" width="135" height="80" rx="8" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="697" y="97" text-anchor="middle" fill="#64748b" font-size="10" font-weight="600">Actions</text>
  <text x="697" y="115" text-anchor="middle" fill="currentColor" font-size="10">read_all → full skill</text>
  <text x="697" y="131" text-anchor="middle" fill="currentColor" font-size="10">list → file paths</text>
  <text x="697" y="147" text-anchor="middle" fill="currentColor" font-size="10">read → single file</text>
</svg>

### `createSkillTool(client, name, version?)`

Creates a tool definition for a single skill. The tool provides filesystem-like access to the skill's content.

```typescript
import { TankClient, createSkillTool } from "@tankpkg/sdk";

const client = new TankClient();
const tool = await createSkillTool(client, "@tank/react");

console.log(tool.name); // 'tank_react'
console.log(tool.files); // ['SKILL.md', 'references/hooks.md', ...]
console.log(tool.description); // Includes skill summary, file list, actions
```

### Tool Actions

The generated tool supports three actions:

| Action     | Description                                              | Returns                                                       |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| `read_all` | Complete skill content (SKILL.md + references + scripts) | `{ success, skill: { content, references, scripts, files } }` |
| `list`     | List all files in the skill                              | `{ success, files }`                                          |
| `read`     | Read a single file by path                               | `{ success, content }`                                        |

```typescript
// Execute actions
const all = await tool.execute({ action: "read_all" });
const files = await tool.execute({ action: "list" });
const file = await tool.execute({ action: "read", path: "references/hooks.md" });
```

### OpenAI Function Calling

```typescript
import OpenAI from "openai";

const openai = new OpenAI();
const tool = await createSkillTool(client, "@tank/react");

// Register as OpenAI tool
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  tools: [tool.toOpenAI()],
  messages: [{ role: "user", content: "Read the React skill and explain hooks." }],
});

// Handle tool call
const call = response.choices[0].message.tool_calls?.[0];
if (call) {
  const result = await tool.execute(JSON.parse(call.function.arguments));
  // Send result back to OpenAI...
}
```

### MCP Tool

```typescript
// Register as MCP tool
const mcpDef = tool.toMCP();
// { name: 'tank_react', description: '...', inputSchema: { type: 'object', ... } }
```

### Multiple Skills

```typescript
import { createSkillTools } from "@tankpkg/sdk";

const tools = await createSkillTools(client, ["@tank/react", "@tank/nextjs", "@tank/clean-code"]);
// Returns array of SkillTool objects, fetched with concurrency=6

const openaiTools = tools.map((t) => t.toOpenAI());
```

---

## Exports

Everything is importable from `@tankpkg/sdk`:

```typescript
import {
  // Client
  TankClient,

  // Errors
  TankError,
  TankAuthError,
  TankNotFoundError,
  TankPermissionError,
  TankNetworkError,
  TankIntegrityError,
  TankConflictError,

  // Types
  type SkillContent,
  type SearchResponse,
  type SkillInfoResponse,
  type VersionDetail,
  type UserInfo,
  type TankClientOptions,

  // Constants
  SDK_VERSION,
  DEFAULT_REGISTRY_URL,
  SUPPORTED_AGENTS,
  AGENT_PATHS,

  // Tool Generator
  createSkillTool,
  createSkillTools,
  type SkillTool,
  type SkillToolInput,
  type SkillToolResult,
  type OpenAIFunctionTool,
  type MCPToolDefinition,

  // Utilities
  hasNativeAcceleration,
} from "@tankpkg/sdk";
```
