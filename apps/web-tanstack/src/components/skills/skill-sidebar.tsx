import { Star } from 'lucide-react';

import { InstallCommand } from '~/components/skills/install-command';
import { Separator } from '~/components/ui/separator';
import { formatSize, timeAgo } from '~/lib/format';
import type { ScanDetails } from '~/lib/data/skills';

export interface SkillSidebarProps {
  name: string;
  repositoryUrl: string | null;
  starCount: number;
  downloadCount: number;
  visibility: string;
  publisher: { name: string; githubUsername: string | null };
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
  publisher,
  latestVersion,
  license,
  scanDetails,
  hasSecurityData,
  permItems
}: SkillSidebarProps) {
  return (
    <aside className="w-72 shrink-0 space-y-4 sticky top-4">
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Install</h3>
        <InstallCommand name={name} />
      </div>

      <Separator />

      {repositoryUrl && (
        <>
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Repository
            </h3>
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
        <dl className="space-y-2 text-sm">
          {latestVersion && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Version</dt>
              <dd className="font-mono text-xs">{latestVersion.version}</dd>
            </div>
          )}
          {license && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">License</dt>
              <dd>{license}</dd>
            </div>
          )}
          <div className="flex justify-between items-center">
            <dt className="text-muted-foreground flex items-center gap-1">
              <Star className="h-3 w-3" />
              Stars
            </dt>
            <dd className="text-sm">{starCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Weekly</dt>
            <dd>{downloadCount.toLocaleString()}</dd>
          </div>
          {latestVersion && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Files</dt>
                <dd>{latestVersion.fileCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Size</dt>
                <dd>{formatSize(latestVersion.tarballSize)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Published</dt>
            <dd>{latestVersion ? timeAgo(latestVersion.publishedAt) : '\u2014'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Publisher</dt>
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
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Visibility</dt>
            <dd>{visibility}</dd>
          </div>
        </dl>
      </div>

      {latestVersion?.auditScore != null && (
        <>
          <Separator />
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Security
            </h3>
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-2xl font-bold ${
                  latestVersion.auditScore >= 8
                    ? 'text-green-600'
                    : latestVersion.auditScore >= 6
                      ? 'text-yellow-600'
                      : latestVersion.auditScore >= 4
                        ? 'text-orange-600'
                        : 'text-red-600'
                }`}>
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

            <div className="text-xs space-y-1 mb-3">
              {(scanDetails?.criticalCount ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-red-600">
                  <span>&#9679;</span>
                  <span>
                    {scanDetails?.criticalCount} critical finding
                    {(scanDetails?.criticalCount ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {(scanDetails?.highCount ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-orange-600">
                  <span>&#9679;</span>
                  <span>
                    {scanDetails?.highCount} high finding
                    {(scanDetails?.highCount ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {(scanDetails?.mediumCount ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-yellow-600">
                  <span>&#9679;</span>
                  <span>
                    {scanDetails?.mediumCount} medium finding
                    {(scanDetails?.mediumCount ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {(scanDetails?.lowCount ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-blue-600">
                  <span>&#9679;</span>
                  <span>
                    {scanDetails?.lowCount} low finding
                    {(scanDetails?.lowCount ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {(scanDetails?.findings?.length ?? 0) === 0 && (
                <div className="flex items-center gap-2 text-green-600">
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
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Permissions
            </h3>
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
    </aside>
  );
}
