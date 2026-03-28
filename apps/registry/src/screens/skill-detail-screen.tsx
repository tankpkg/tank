import { useMemo, useState } from 'react';

import { SkillSidebar } from '~/components/skills/skill-sidebar';
import { SkillTabs } from '~/components/skills/skill-tabs';
import { Badge } from '~/components/ui/badge';
import { safeParseJson, safeParsePermissions } from '~/lib/format';
import type { SkillDetailResult } from '~/lib/skills/data';
import { buildSecurityTab } from '~/screens/skill-detail-helpers';

function parseDescription(raw: string | null): { summary: string; triggers: string[] } {
  if (!raw) return { summary: '', triggers: [] };

  const triggerIdx = raw.indexOf('Triggers:');
  if (triggerIdx === -1) return { summary: raw.trim(), triggers: [] };

  const summary = raw
    .slice(0, triggerIdx)
    .replace(/\.\s*$/, '')
    .trim();
  const triggerStr = raw
    .slice(triggerIdx + 'Triggers:'.length)
    .replace(/\.$/, '')
    .trim();
  const triggers = triggerStr
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return { summary, triggers };
}

interface SkillDetailScreenProps {
  data: SkillDetailResult;
}

export function SkillDetailScreen({ data }: SkillDetailScreenProps) {
  const [activeTab, setActiveTab] = useState('readme');
  const latestManifest = safeParseJson(data.latestVersion?.manifest);
  const fileList: string[] = Array.isArray(latestManifest?.files) ? (latestManifest.files as string[]) : [];
  const license = typeof latestManifest?.license === 'string' ? latestManifest.license : null;
  const permissions = safeParsePermissions(data.latestVersion?.permissions);

  const permItems: string[] = [];
  if (permissions?.network?.outbound?.length) permItems.push(`Network: ${permissions.network.outbound.length} host(s)`);
  if (permissions?.filesystem?.read?.length || permissions?.filesystem?.write?.length)
    permItems.push('Filesystem access');
  if (permissions?.subprocess) permItems.push('Subprocess execution');

  const readmeContent = data.latestVersion?.readme;
  const scanDetails = data.latestVersion?.scanDetails;
  const hasSecurityData = data.latestVersion?.auditScore != null && scanDetails != null;

  const securityTab = hasSecurityData && scanDetails ? buildSecurityTab({ data, scanDetails }) : null;
  const desc = useMemo(() => parseDescription(data.description), [data.description]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="skill-detail-root">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold tracking-tight font-mono">{data.name}</h1>
          {data.latestVersion && (
            <Badge variant="secondary" className="font-mono text-xs">
              {data.latestVersion.version}
            </Badge>
          )}
          {data.visibility === 'private' && (
            <Badge variant="outline" className="text-xs">
              Private
            </Badge>
          )}
        </div>
        {desc.summary && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-1.5">Description</h3>
            <p className="text-sm text-foreground/80 leading-relaxed">{desc.summary}.</p>
          </div>
        )}
        {desc.triggers.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">Triggered by</h3>
            <div className="flex flex-wrap gap-1.5">
              {desc.triggers.map((trigger) => (
                <Badge key={trigger} variant="outline" className="text-xs font-normal">
                  {trigger}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <SkillTabs
        readmeContent={readmeContent ?? null}
        versions={data.versions.map((v) => ({
          ...v,
          publishedAt: v.publishedAt instanceof Date ? v.publishedAt.toISOString() : String(v.publishedAt)
        }))}
        files={fileList}
        skillName={data.name}
        version={data.latestVersion?.version ?? ''}
        readme={data.latestVersion?.readme ?? null}
        manifest={latestManifest}
        securityTab={securityTab}
        hasSecurityData={hasSecurityData}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sidebar={
          <SkillSidebar
            name={data.name}
            repositoryUrl={data.repositoryUrl}
            starCount={data.starCount}
            downloadCount={data.downloadCount}
            visibility={data.visibility}
            isStarred={data.isStarred}
            description={data.description}
            hasReadme={!!readmeContent}
            hasPermissionsDeclared={!!permissions}
            publisher={data.publisher}
            latestVersion={data.latestVersion}
            license={license}
            scanDetails={scanDetails ?? null}
            hasSecurityData={hasSecurityData}
            permItems={permItems}
          />
        }
      />
    </div>
  );
}
