import { Star } from 'lucide-react';

import { DownloadButton } from '~/components/skills/download-button';
import { InstallCommand } from '~/components/skills/install-command';
import { QualityChecks } from '~/components/skills/quality-checks';
import { StarButton } from '~/components/skills/star-button';
import { TrustBadge } from '~/components/skills/trust-badge';
import { VerifiedPublisherBadge } from '~/components/skills/verified-publisher-badge';
import { Separator } from '~/components/ui/separator';
import { formatSize, timeAgo } from '~/lib/format';
import { getScoreTextClass } from '~/lib/score';
import type { ScanDetails } from '~/lib/skills/data';

const findings = [
  { key: 'criticalCount', label: 'critical', color: 'text-red-600' },
  { key: 'highCount', label: 'high', color: 'text-orange-500' },
  { key: 'mediumCount', label: 'medium', color: 'text-yellow-500' },
  { key: 'lowCount', label: 'low', color: 'text-blue-500' }
] as const;

export interface SkillSidebarProps {
  name: string;
  repositoryUrl: string | null;
  starCount: number;
  downloadCount: number;
  visibility: string;
  isStarred: boolean;
  description: string | null;
  hasReadme: boolean;
  hasPermissionsDeclared: boolean;
  publisher: { name: string; githubUsername: string | null; emailVerified?: boolean };
  latestVersion: {
    version: string;
    auditScore: number | null;
    publishedAt: Date;
    fileCount: number;
    tarballSize: number;
  } | null;
  license: string | null;
  scanDetails: ScanDetails | null;
  hasSecurityData: boolean;
  permItems: string[];
}

export function SkillSidebar({
  name,
  repositoryUrl,
  starCount,
  downloadCount,
  visibility,
  isStarred,
  description,
  hasReadme,
  hasPermissionsDeclared,
  publisher,
  latestVersion,
  license,
  scanDetails,
  hasSecurityData,
  permItems
}: SkillSidebarProps) {
  return (
    <aside className="w-72 shrink-0 space-y-4 sticky top-4">
      <div className="flex items-center gap-2">
        <StarButton skillName={name} initialStarred={isStarred} initialCount={starCount} />
        {latestVersion && <DownloadButton skillName={name} version={latestVersion.version} />}
      </div>

      {publisher && (
        <VerifiedPublisherBadge
          hasVerifiedEmail={publisher.emailVerified ?? false}
          hasGithubUsername={!!publisher.githubUsername}
        />
      )}

      {scanDetails && (
        <TrustBadge
          verdict={scanDetails.verdict}
          criticalCount={scanDetails.criticalCount}
          highCount={scanDetails.highCount}
          mediumCount={scanDetails.mediumCount}
        />
      )}

      <Separator />

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Install</h3>
        <InstallCommand name={name} />
      </div>

      <Separator />

      {repositoryUrl && (
        <>
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Repository</h3>
            <a
              href={repositoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              {repositoryUrl.replace('https://github.com/', '')}
              <span className="text-xs">&#8599;</span>
            </a>
          </div>
          <Separator />
        </>
      )}

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Metadata</h3>
        <dl className="space-y-2 text-sm [&>div]:flex [&>div]:justify-between [&_dt]:text-muted-foreground">
          {latestVersion && (
            <div>
              <dt>Version</dt>
              <dd className="font-mono text-xs">{latestVersion.version}</dd>
            </div>
          )}
          {license && (
            <div>
              <dt>License</dt>
              <dd>{license}</dd>
            </div>
          )}
          <div className="items-center">
            <dt className="flex items-center gap-1">
              <Star className="h-3 w-3" />
              Stars
            </dt>
            <dd className="text-sm">{starCount}</dd>
          </div>
          <div>
            <dt>Weekly</dt>
            <dd>{downloadCount.toLocaleString()}</dd>
          </div>
          {latestVersion && (
            <>
              <div>
                <dt>Files</dt>
                <dd>{latestVersion.fileCount}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatSize(latestVersion.tarballSize)}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Published</dt>
            <dd>{latestVersion ? timeAgo(latestVersion.publishedAt) : '\u2014'}</dd>
          </div>
          <div>
            <dt>Publisher</dt>
            <dd>
              {publisher.githubUsername ? (
                <a
                  href={`https://github.com/${publisher.githubUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline">
                  {publisher.githubUsername}
                </a>
              ) : (
                publisher.name
              )}
            </dd>
          </div>
          <div>
            <dt>Visibility</dt>
            <dd>{visibility}</dd>
          </div>
        </dl>
      </div>

      {latestVersion?.auditScore != null && (
        <>
          <Separator />
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Security</h3>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-2xl font-bold ${getScoreTextClass(latestVersion.auditScore)}`}>
                {latestVersion.auditScore}
              </span>
              <span className="text-sm text-muted-foreground">/10</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
              <div
                className={`h-full transition-all ${
                  latestVersion.auditScore >= 8
                    ? 'bg-green-500'
                    : latestVersion.auditScore >= 6
                      ? 'bg-yellow-500'
                      : latestVersion.auditScore >= 4
                        ? 'bg-orange-500'
                        : 'bg-red-500'
                }`}
                style={{ width: `${(latestVersion.auditScore / 10) * 100}%` }}
              />
            </div>

            {scanDetails?.verdict && (
              <div
                className={`inline-flex px-2 py-1 rounded text-xs font-medium text-white mb-2 ${
                  scanDetails.verdict === 'pass'
                    ? 'bg-green-600'
                    : scanDetails.verdict === 'pass_with_notes'
                      ? 'bg-yellow-600'
                      : scanDetails.verdict === 'flagged'
                        ? 'bg-orange-600'
                        : 'bg-red-600'
                }`}>
                {scanDetails.verdict.replace('_', ' ').toUpperCase()}
              </div>
            )}

            <div className="text-xs space-y-1 mb-3 [&>div]:flex [&>div]:items-center [&>div]:gap-2">
              {findings
                .filter(({ key }) => (scanDetails?.[key] ?? 0) > 0)
                .map(({ key, label, color }) => (
                  <div key={key} className={color}>
                    <span>&#9679;</span>
                    <span>
                      {scanDetails?.[key]} {label} finding
                      {(scanDetails?.[key] ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              {(scanDetails?.findings?.length ?? 0) === 0 && (
                <div className="text-green-600">
                  <span>&#10003;</span>
                  <span>No security issues</span>
                </div>
              )}
            </div>

            {hasSecurityData && (
              <p className="text-xs text-muted-foreground">Open the Security tab above for the full report.</p>
            )}
          </div>
        </>
      )}

      {permItems.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Permissions</h3>
            <ul className="space-y-1">
              {permItems.map((item) => (
                <li key={item} className="text-sm flex items-center gap-1.5">
                  <span className="text-amber-500 text-xs">&#9888;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <Separator />
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quality</h3>
        <QualityChecks
          hasReadme={hasReadme}
          hasDescription={!!description}
          hasRepository={!!repositoryUrl}
          hasScanComplete={hasSecurityData}
          hasPermissions={hasPermissionsDeclared}
        />
      </div>
    </aside>
  );
}
