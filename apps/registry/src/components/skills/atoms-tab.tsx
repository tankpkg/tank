import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { AtomKindBadge, AtomKindBadges } from "~/components/skills/atom-kind-badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { atomDisplayConfig, isBundle, type AtomDisplayKind } from "~/lib/skills/atoms";

interface AtomsTabProps {
  atoms: Record<string, unknown>[];
}

function getPrimaryIdentifier(atom: Record<string, unknown>): string {
  const kind = atom.kind as string | undefined;
  const candidates: (keyof typeof atom)[] = ["name", "event", "scope", "uri"];
  if (kind === "resource") return (atom.uri as string) ?? (atom.name as string) ?? "(unnamed)";
  if (kind === "hook") return (atom.event as string) ?? (atom.name as string) ?? "(unnamed)";
  if (kind === "instruction") return (atom.scope as string) ?? (atom.name as string) ?? "(unnamed)";
  for (const key of candidates) {
    if (atom[key] && typeof atom[key] === "string") return atom[key] as string;
  }
  return "(unnamed)";
}

function getKeyFields(atom: Record<string, unknown>): Array<{ key: string; value: string }> {
  const skip = new Set(["kind", "name", "event", "scope", "uri", "description"]);
  const entries = Object.entries(atom)
    .filter(([k, v]) => !skip.has(k) && v != null && typeof v !== "object")
    .slice(0, 3);
  return entries.map(([k, v]) => ({ key: k, value: String(v) }));
}

function AtomCard({ atom }: { atom: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const kind = (atom.kind as string) ?? "skill";
  const identifier = getPrimaryIdentifier(atom);
  const keyFields = getKeyFields(atom);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2" data-testid="atom-card">
      <div className="flex items-center gap-2 flex-wrap">
        <AtomKindBadge kind={kind as AtomDisplayKind} size="sm" />
        <span className="font-mono text-sm font-medium truncate">{identifier}</span>
      </div>
      {typeof atom.description === "string" && atom.description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{atom.description}</p>
      )}
      {keyFields.length > 0 && (
        <dl className="text-xs space-y-0.5">
          {keyFields.map(({ key, value }) => (
            <div key={key} className="flex gap-2">
              <dt className="text-muted-foreground shrink-0">{key}:</dt>
              <dd className="font-mono truncate">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-0 text-xs text-muted-foreground"
        onClick={() => setExpanded((p) => !p)}>
        {expanded ? "Show less" : "Show more"}
      </Button>
      {expanded && (
        <pre className="rounded border bg-muted/50 p-2 text-[10px] font-mono overflow-x-auto">
          {JSON.stringify(atom, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AtomsTab({ atoms }: AtomsTabProps) {
  const kinds = Array.from(new Set(atoms.map((a) => (a.kind as string) ?? "skill")));
  const bundle = isBundle(kinds as AtomDisplayKind[]);

  const grouped = kinds.reduce<Record<string, Record<string, unknown>[]>>((acc, kind) => {
    acc[kind] = atoms.filter((a) => (a.kind ?? "skill") === kind);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/50 p-4 text-sm leading-relaxed">
        <p>
          <strong>Atoms</strong> are the building blocks of a Tank package. Each atom teaches your AI agent a specific
          capability — follow a rule, intercept a tool call, take on a role, or use a resource.{" "}
          <Link to="/docs/$" params={{ _splat: "atoms" }} className="text-primary hover:underline">
            Learn about atoms →
          </Link>
        </p>
      </div>

      {bundle && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">This package contains:</span>
          <AtomKindBadges kinds={kinds} size="sm" />
        </div>
      )}

      {kinds.map((kind, i) => {
        const config = atomDisplayConfig[kind as AtomDisplayKind];
        const label = config?.label ?? kind;
        const kindAtoms = grouped[kind] ?? [];
        return (
          <div key={kind}>
            {i > 0 && <Separator className="mb-6" />}
            <h3 className="font-display text-base font-semibold tracking-tight mb-3">
              {config?.emoji} {label}s
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {kindAtoms.map((atom, idx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: atom objects lack stable unique IDs
                <AtomCard key={idx} atom={atom} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
