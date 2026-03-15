"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface SkillPermissions {
  network?: { outbound?: string[] };
  filesystem?: { read?: string[]; write?: string[] };
  subprocess?: boolean;
}

interface SkillManifestTabProps {
  manifest: Record<string, unknown> | undefined;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <dt className="text-sm text-muted-foreground w-28 shrink-0">{label}</dt>
      <dd className="text-sm flex-1">{value}</dd>
    </div>
  );
}

function PermissionsView({ permissions }: { permissions: SkillPermissions }) {
  const hasNetwork = (permissions.network?.outbound?.length ?? 0) > 0;
  const hasFilesystemRead = (permissions.filesystem?.read?.length ?? 0) > 0;
  const hasFilesystemWrite = (permissions.filesystem?.write?.length ?? 0) > 0;
  const hasSubprocess = permissions.subprocess === true;

  if (!hasNetwork && !hasFilesystemRead && !hasFilesystemWrite && !hasSubprocess) {
    return <p className="text-sm text-muted-foreground italic">No permissions declared.</p>;
  }

  return (
    <div className="space-y-3" data-testid="permissions-section">
      {hasNetwork && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <span className="text-amber-500">⬡</span> Network — outbound
          </p>
          <ul className="space-y-1 pl-4">
            {permissions.network!.outbound!.map((domain) => (
              <li key={domain} className="text-sm font-mono text-foreground/80">
                {domain}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(hasFilesystemRead || hasFilesystemWrite) && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <span className="text-amber-500">⬡</span> Filesystem
          </p>
          {hasFilesystemRead && (
            <div className="pl-4 mb-1.5">
              <p className="text-xs text-muted-foreground mb-1">Read</p>
              <ul className="space-y-0.5">
                {permissions.filesystem!.read!.map((glob) => (
                  <li key={glob} className="text-sm font-mono text-foreground/80">
                    {glob}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasFilesystemWrite && (
            <div className="pl-4">
              <p className="text-xs text-muted-foreground mb-1">Write</p>
              <ul className="space-y-0.5">
                {permissions.filesystem!.write!.map((glob) => (
                  <li key={glob} className="text-sm font-mono text-foreground/80">
                    {glob}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {hasSubprocess && (
        <div className="flex items-center gap-2">
          <span className="text-amber-500">⬡</span>
          <p className="text-sm">Subprocess execution allowed</p>
        </div>
      )}
    </div>
  );
}

function DependenciesView({ skills }: { skills: Record<string, string> }) {
  const entries = Object.entries(skills);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No dependencies declared.</p>;
  }

  return (
    <ul className="space-y-1.5" data-testid="dependencies-section">
      {entries.map(([name, version]) => (
        <li key={name} className="flex items-center justify-between gap-4 py-1 border-b border-border/50 last:border-0">
          <span className="text-sm font-mono text-foreground/90">{name}</span>
          <Badge variant="outline" className="font-mono text-xs shrink-0">
            {version}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function SkillManifestTab({ manifest }: SkillManifestTabProps) {
  if (!manifest) {
    return (
      <div className="py-12 text-center text-muted-foreground" data-testid="manifest-empty-state">
        <p className="text-lg font-medium mb-1">No manifest available</p>
        <p className="text-sm">
          This skill doesn&apos;t have a parseable{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">skills.json</code> manifest.
        </p>
      </div>
    );
  }

  const name = typeof manifest.name === "string" ? manifest.name : null;
  const version = typeof manifest.version === "string" ? manifest.version : null;
  const description = typeof manifest.description === "string" ? manifest.description : null;
  const repository = typeof manifest.repository === "string" ? manifest.repository : null;
  const visibility = typeof manifest.visibility === "string" ? manifest.visibility : null;
  const skills =
    manifest.skills && typeof manifest.skills === "object" && !Array.isArray(manifest.skills)
      ? (manifest.skills as Record<string, string>)
      : null;
  const permissions =
    manifest.permissions && typeof manifest.permissions === "object"
      ? (manifest.permissions as SkillPermissions)
      : null;
  const audit =
    manifest.audit && typeof manifest.audit === "object" && !Array.isArray(manifest.audit)
      ? (manifest.audit as { min_score?: number })
      : null;

  const hasPermissions =
    permissions &&
    ((permissions.network?.outbound?.length ?? 0) > 0 ||
      (permissions.filesystem?.read?.length ?? 0) > 0 ||
      (permissions.filesystem?.write?.length ?? 0) > 0 ||
      permissions.subprocess === true);

  const hasDependencies = skills && Object.keys(skills).length > 0;

  return (
    <div className="space-y-6" data-testid="manifest-root">
      <Section title="Identity">
        <dl>
          {name && <Field label="Name" value={<span className="font-mono">{name}</span>} />}
          {version && (
            <Field
              label="Version"
              value={
                <Badge variant="secondary" className="font-mono text-xs">
                  {version}
                </Badge>
              }
            />
          )}
          {description && <Field label="Description" value={description} />}
          {repository && (
            <Field
              label="Repository"
              value={
                <a
                  href={repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1 text-sm">
                  {repository.replace("https://github.com/", "")}
                  <span className="text-xs">&#8599;</span>
                </a>
              }
            />
          )}
          {visibility && (
            <Field
              label="Visibility"
              value={
                <Badge variant={visibility === "private" ? "outline" : "secondary"} className="text-xs capitalize">
                  {visibility}
                </Badge>
              }
            />
          )}
          {audit?.min_score != null && (
            <Field label="Min audit score" value={<span className="font-mono">{audit.min_score}/10</span>} />
          )}
        </dl>
      </Section>

      {hasPermissions && (
        <>
          <Separator />
          <Section title="Permissions">
            <PermissionsView permissions={permissions!} />
          </Section>
        </>
      )}

      {hasDependencies && (
        <>
          <Separator />
          <Section title="Dependencies">
            <DependenciesView skills={skills!} />
          </Section>
        </>
      )}
    </div>
  );
}
