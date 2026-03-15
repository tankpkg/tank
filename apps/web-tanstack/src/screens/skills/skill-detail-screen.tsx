import { SkillSidebar } from '~/components/skills/skill-sidebar';
import { SkillTabs } from '~/components/skills/skill-tabs';
import { Badge } from '~/components/ui/badge';
import { safeParseJson, safeParsePermissions } from '~/lib/format';
import type { SkillDetailResult } from '~/lib/skills/data';
import { buildSecurityTab, buildSkillJsonLd } from '~/screens/skills/skill-detail-helpers';

interface SkillDetailScreenProps {
  data: SkillDetailResult;
}

export function SkillDetailScreen({ data }: SkillDetailScreenProps) {
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

  const jsonLd = buildSkillJsonLd(data);

  return (
    <>
      {/* JSON-LD structured data uses only server-side values — safe to render as raw JSON */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data from server-side values only
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
          {data.description && <p className="text-muted-foreground">{data.description}</p>}
        </div>

        <div className="flex gap-8 items-start">
          <div className="flex-1 min-w-0">
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
            />
          </div>

          <SkillSidebar
            name={data.name}
            repositoryUrl={data.repositoryUrl}
            starCount={data.starCount}
            downloadCount={data.downloadCount}
            visibility={data.visibility}
            publisher={data.publisher}
            latestVersion={data.latestVersion}
            license={license}
            scanDetails={scanDetails ?? null}
            hasSecurityData={hasSecurityData}
            permItems={permItems}
          />
        </div>
      </div>
    </>
  );
}
