/**
 * BDD step definitions for atom-type-badges system scenarios.
 * Intent: idd/modules/atom-type-badges/INTENT.md
 * Covers: extractAtomKinds (C1–C3), isBundle (C3)
 */

import { describe, expect, it } from "vitest";

import { extractAtomKinds, isBundle } from "../../../apps/registry/src/lib/skills/atoms";

// ── extractAtomKinds ────────────────────────────────────────────────────────

describe("extractAtomKinds (C1–C2)", () => {
  it("Extract unique kinds from multi-atom manifest (E1)", () => {
    // Given a manifest with atoms of kinds "hook", "hook", and "agent"
    const manifest = {
      atoms: [
        { kind: "hook", event: "pre-tool-use", handler: { type: "dsl", actions: [] } },
        { kind: "hook", event: "post-tool-use", handler: { type: "dsl", actions: [] } },
        { kind: "agent", name: "reviewer", role: "code reviewer" },
      ],
    };
    // When I call extractAtomKinds on the manifest
    const result = extractAtomKinds(manifest);
    // Then the result is ["hook", "agent"]
    expect(result).toEqual(["hook", "agent"]);
  });

  it("Extract three distinct kinds (E2)", () => {
    const manifest = {
      atoms: [
        { kind: "instruction", content: "rules.md", scope: "global" },
        { kind: "tool", name: "my-tool" },
        { kind: "rule", event: "pre-tool-use", policy: "block" },
      ],
    };
    const result = extractAtomKinds(manifest);
    expect(result).toEqual(["instruction", "tool", "rule"]);
  });

  it("Legacy manifest with no atoms field returns skill fallback (E3)", () => {
    const manifest = { name: "@tank/old-skill", version: "1.0.0" };
    const result = extractAtomKinds(manifest);
    expect(result).toEqual(["skill"]);
  });

  it("Manifest with empty atoms array returns skill fallback (E4)", () => {
    const manifest = { atoms: [] };
    const result = extractAtomKinds(manifest);
    expect(result).toEqual(["skill"]);
  });

  it("Null/undefined manifest returns skill fallback", () => {
    expect(extractAtomKinds(null)).toEqual(["skill"]);
    expect(extractAtomKinds(undefined)).toEqual(["skill"]);
  });

  it("Atoms with unrecognized kinds are silently skipped", () => {
    const manifest = {
      atoms: [{ kind: "agent", name: "x", role: "y" }, { kind: "not-a-real-kind" }],
    };
    const result = extractAtomKinds(manifest as Record<string, unknown>);
    expect(result).toEqual(["agent"]);
  });
});

// ── isBundle ────────────────────────────────────────────────────────────────

describe("isBundle (C3)", () => {
  it("Two distinct real types is a bundle (E5)", () => {
    expect(isBundle(["hook", "agent"])).toBe(true);
  });

  it("Three distinct real types is a bundle", () => {
    expect(isBundle(["instruction", "hook", "agent"])).toBe(true);
  });

  it("Single legacy kind is not a bundle (E6)", () => {
    expect(isBundle(["skill"])).toBe(false);
  });

  it("Single real kind is not a bundle (E6)", () => {
    expect(isBundle(["instruction"])).toBe(false);
  });

  it("Empty array is not a bundle", () => {
    expect(isBundle([])).toBe(false);
  });
});
