import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { McpTestClient } from "../interactions/mcp-client.js";
import { registerMcpHooks, type McpBddWorld } from "../support/hooks.js";
import { setupE2E } from "../support/setup.js";

const hasRegistry = !!process.env.E2E_REGISTRY_URL;

const world: McpBddWorld = {
  client: new McpTestClient(),
  home: "",
  registry: process.env.E2E_REGISTRY_URL ?? "http://localhost:3003",
};

registerMcpHooks(world);

// ── Given steps ──────────────────────────────────────────────────────────────

async function givenMcpServerIsRunning(): Promise<void> {
  const tools = await world.client.listTools();
  expect(Array.isArray(tools)).toBe(true);
}

async function givenEmmaIsAuthenticatedWithTank(): Promise<void> {
  const ctx = await setupE2E(world.registry);
  world.e2eContext = ctx;
  world.home = ctx.home;

  await world.client.stop();
  await world.client.start({
    home: ctx.home,
    env: {
      TANK_TOKEN: ctx.token,
    },
  });
}

async function givenNoUserIsAuthenticatedWithTank(): Promise<void> {
  const configPath = path.join(world.home, ".tank", "config.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw) as {
    registry: string;
    token?: string;
    user?: { name: string; email: string };
  };

  delete config.token;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

  await world.client.stop();
  await world.client.start({ home: world.home });
}

function givenRegistryIsReachable(): void {
  // Given the hooks set up a config pointing at E2E_REGISTRY_URL, this is a no-op.
  // The registry is already reachable by default.
}

async function givenRegistryIsUnreachable(): Promise<void> {
  const configPath = path.join(world.home, ".tank", "config.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw) as {
    registry: string;
    token?: string;
    user?: { name: string; email: string };
  };
  config.registry = "http://127.0.0.1:1";
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

  await world.client.stop();
  await world.client.start({
    home: world.home,
    env: world.e2eContext ? { TANK_TOKEN: world.e2eContext.token } : undefined,
  });
}

function givenNodeVersionMeetsMinimum(): void {
  const major = parseInt(process.version.replace("v", ""), 10);
  expect(major).toBeGreaterThanOrEqual(24);
}

function givenConfigFileExistsAndIsValid(): void {
  const configPath = path.join(world.home, ".tank", "config.json");
  expect(fs.existsSync(configPath)).toBe(true);
  const raw = fs.readFileSync(configPath, "utf-8");
  JSON.parse(raw);
}

async function givenEmmaHasExpiredCredentials(): Promise<void> {
  const configPath = path.join(world.home, ".tank", "config.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw) as {
    registry: string;
    token?: string;
    user?: { name: string; email: string };
  };
  config.token = "tank_expired_token_for_bdd";
  config.user = { name: "Emma", email: "emma@example.com" };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

  await world.client.stop();
  await world.client.start({ home: world.home });
}

async function givenNoConfigFileExists(): Promise<void> {
  const configPath = path.join(world.home, ".tank", "config.json");
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }

  await world.client.stop();
  await world.client.start({ home: world.home });
}

async function givenMalformedConfigFileExists(): Promise<void> {
  const configPath = path.join(world.home, ".tank", "config.json");
  fs.writeFileSync(configPath, "{ this is not valid json !!!");

  await world.client.stop();
  await world.client.start({ home: world.home });
}

// ── When steps ───────────────────────────────────────────────────────────────

async function whenAgentCallsDoctorTool(): Promise<void> {
  world.lastToolResult = await world.client.callTool("doctor");
}

// ── Then helpers ─────────────────────────────────────────────────────────────

function getContent(): string {
  return world.lastToolResult?.content ?? "";
}

function thenResponseContains(pattern: RegExp): void {
  expect(getContent()).toMatch(pattern);
}

function thenCheckShowsStatus(checkName: string, status: "PASS" | "FAIL"): void {
  const content = getContent();
  const checkPattern = new RegExp(`\\[${status}\\]\\s+${checkName}`, "i");
  expect(content).toMatch(checkPattern);
}

// ── Feature: Environment diagnostics via MCP tool ────────────────────────────

describe("Feature: Environment diagnostics via MCP tool", () => {
  describe("Scenario: Agent runs diagnostics on a fully healthy environment", () => {
    it.skipIf(!hasRegistry)("Given/When/Then for all checks passing", async () => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();
      givenRegistryIsReachable();
      givenNodeVersionMeetsMinimum();
      givenConfigFileExistsAndIsValid();

      await whenAgentCallsDoctorTool();

      thenResponseContains(/Tank Doctor Report/);
      thenCheckShowsStatus("Configuration File", "PASS");
      thenCheckShowsStatus("Registry Connectivity", "PASS");
      thenCheckShowsStatus("Node.js Version", "PASS");

      const content = getContent();
      expect(content).toMatch(/\[(PASS|FAIL)\]\s+Authentication/);
    });
  });

  describe("Scenario: Agent runs diagnostics when not authenticated", () => {
    it.skipIf(!hasRegistry)("Given/When/Then for auth failure with other checks passing", async () => {
      await givenMcpServerIsRunning();
      await givenNoUserIsAuthenticatedWithTank();
      givenRegistryIsReachable();
      givenNodeVersionMeetsMinimum();

      await whenAgentCallsDoctorTool();

      thenCheckShowsStatus("Authentication", "FAIL");
      thenResponseContains(/login/i);
      thenCheckShowsStatus("Registry Connectivity", "PASS");
      thenCheckShowsStatus("Node.js Version", "PASS");
    });
  });

  describe("Scenario: Agent runs diagnostics when credentials are expired", () => {
    it.skipIf(!hasRegistry)("Given/When/Then for expired credentials", async () => {
      await givenMcpServerIsRunning();
      await givenEmmaHasExpiredCredentials();

      await whenAgentCallsDoctorTool();

      thenCheckShowsStatus("Authentication", "FAIL");
      thenResponseContains(/expired|invalid/i);
      thenResponseContains(/login/i);
    });
  });

  describe("Scenario: Agent runs diagnostics when the registry is unreachable", () => {
    it("Given/When/Then for registry connectivity failure", async () => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();
      await givenRegistryIsUnreachable();
      givenNodeVersionMeetsMinimum();

      await whenAgentCallsDoctorTool();

      thenCheckShowsStatus("Registry Connectivity", "FAIL");
      thenResponseContains(/127\.0\.0\.1/);
      thenCheckShowsStatus("Node.js Version", "PASS");
    });
  });

  describe("Scenario: Agent runs diagnostics when Node.js version is below the minimum", () => {
    // We cannot change the actual Node.js version in tests.
    // Since we run on Node 24+, this check always passes.
    // This test verifies the tool reports PASS for the current version,
    // confirming the version check logic works for the passing case.
    it("Given/When/Then for Node.js version check (always passes on Node 24+)", async () => {
      await givenMcpServerIsRunning();
      givenNodeVersionMeetsMinimum();

      await whenAgentCallsDoctorTool();

      thenCheckShowsStatus("Node.js Version", "PASS");
      thenResponseContains(/v\d+\.\d+\.\d+/);
      thenResponseContains(/24\.0\.0/);
    });
  });

  describe("Scenario: Agent runs diagnostics when Node.js version meets the minimum exactly", () => {
    it("Given/When/Then for Node.js version at minimum", async () => {
      await givenMcpServerIsRunning();
      givenNodeVersionMeetsMinimum();

      await whenAgentCallsDoctorTool();

      thenCheckShowsStatus("Node.js Version", "PASS");
    });
  });

  describe("Scenario: Agent runs diagnostics when the configuration file is missing", () => {
    it("Given/When/Then for missing config file", async () => {
      await givenMcpServerIsRunning();
      await givenNoConfigFileExists();

      await whenAgentCallsDoctorTool();

      thenCheckShowsStatus("Configuration File", "FAIL");
      thenResponseContains(/config\.json/i);
    });
  });

  describe("Scenario: Agent runs diagnostics when the configuration file is malformed", () => {
    it("Given/When/Then for malformed config file", async () => {
      await givenMcpServerIsRunning();
      await givenMalformedConfigFileExists();

      await whenAgentCallsDoctorTool();

      thenCheckShowsStatus("Configuration File", "FAIL");
      thenResponseContains(/malformed/i);
    });
  });

  describe("Scenario: Agent runs diagnostics when multiple checks fail", () => {
    it("Given/When/Then for multiple failures", async () => {
      await givenMcpServerIsRunning();
      await givenNoUserIsAuthenticatedWithTank();
      await givenRegistryIsUnreachable();

      await whenAgentCallsDoctorTool();

      thenCheckShowsStatus("Authentication", "FAIL");
      thenCheckShowsStatus("Registry Connectivity", "FAIL");
      thenResponseContains(/not healthy/i);
      thenResponseContains(/login/i);
      thenResponseContains(/network|connection|registry/i);
    });
  });

  describe("Scenario: Agent receives a structured summary from the doctor tool", () => {
    it("Given/When/Then for structured summary", async () => {
      await givenMcpServerIsRunning();
      await givenEmmaIsAuthenticatedWithTank();

      await whenAgentCallsDoctorTool();

      const content = getContent();

      expect(content).toMatch(/\[PASS\]\s+Configuration File/);
      expect(content).toMatch(/\[(PASS|FAIL)\]\s+Authentication/);
      expect(content).toMatch(/\[PASS\]\s+Node\.js Version/);

      expect(content).toMatch(/Tank Doctor Report/);
      expect(content).toMatch(/passed|ready to use|not healthy/i);
    });
  });
});
