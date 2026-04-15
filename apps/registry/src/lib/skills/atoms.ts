import { atomKindSchema } from "@internals/schemas";

export type AtomDisplayKind = "instruction" | "hook" | "tool" | "agent" | "rule" | "resource" | "prompt" | "skill";

export interface AtomDisplayConfig {
  emoji: string;
  label: string;
  badgeClassName: string;
}

export const atomDisplayConfig: Record<AtomDisplayKind, AtomDisplayConfig> = {
  instruction: {
    emoji: "📜",
    label: "Instruction",
    badgeClassName: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  hook: {
    emoji: "🪝",
    label: "Hook",
    badgeClassName: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  tool: {
    emoji: "🔧",
    label: "Tool",
    badgeClassName: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  },
  agent: {
    emoji: "🤖",
    label: "Agent",
    badgeClassName: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  rule: {
    emoji: "🛡",
    label: "Rule",
    badgeClassName: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  resource: {
    emoji: "📡",
    label: "Resource",
    badgeClassName: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  },
  prompt: {
    emoji: "💬",
    label: "Prompt",
    badgeClassName: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  },
  skill: {
    emoji: "📦",
    label: "Skill",
    badgeClassName: "bg-muted text-muted-foreground border-border",
  },
};

export const ALL_ATOM_DISPLAY_KINDS: AtomDisplayKind[] = [
  "instruction",
  "hook",
  "tool",
  "agent",
  "rule",
  "resource",
  "prompt",
  "skill",
];

export function extractAtomKinds(manifest: Record<string, unknown> | null | undefined): AtomDisplayKind[] {
  if (!manifest?.atoms || !Array.isArray(manifest.atoms) || manifest.atoms.length === 0) {
    return ["skill"];
  }

  const seen = new Set<AtomDisplayKind>();
  for (const atom of manifest.atoms) {
    if (atom && typeof atom === "object" && "kind" in atom) {
      const parsed = atomKindSchema.safeParse((atom as Record<string, unknown>).kind);
      if (parsed.success) {
        seen.add(parsed.data as AtomDisplayKind);
      }
    }
  }

  return seen.size > 0 ? Array.from(seen) : ["skill"];
}

export function isBundle(kinds: AtomDisplayKind[]): boolean {
  return kinds.length >= 2 && !kinds.includes("skill");
}
