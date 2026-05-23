import type { ReactNode } from 'react';
import { AtomsTab } from '~/components/skills/atoms-tab';
import { FileExplorer } from '~/components/skills/file-explorer';
import { SkillReadme } from '~/components/skills/skill-readme';
import { Badge } from '~/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { formatDate } from '~/lib/format';
import type { SkillVersionSummary } from '~/lib/skills/data';

type SerializedVersion = Omit<SkillVersionSummary, 'publishedAt'> & { publishedAt: string };

interface SkillTabsProps {
  readmeContent: string | null;
  versions: SerializedVersion[];
  files: string[];
  skillName: string;
  version: string;
  readme: string | null;
  manifest?: Record<string, unknown>;
  securityTab?: ReactNode;
  hasSecurityData?: boolean;
  tokenTab?: ReactNode;
  hasTokenData?: boolean;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  sidebar?: ReactNode;
  atoms?: Record<string, unknown>[];
}

function VersionHistory({ versions }: { versions: SerializedVersion[] }) {
  if (versions.length === 0) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Version</TableHead>
          <TableHead>Published</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {versions.map((v) => (
          <TableRow key={v.version}>
            <TableCell className="font-mono font-medium">{v.version}</TableCell>
            <TableCell className="text-muted-foreground">{formatDate(v.publishedAt)}</TableCell>
            <TableCell>
              <Badge variant={v.auditStatus === 'published' || v.auditStatus === 'completed' ? 'secondary' : 'outline'}>
                {v.auditStatus}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SkillTabs({
  readmeContent,
  versions,
  files,
  skillName,
  version,
  readme,
  manifest,
  securityTab,
  hasSecurityData = false,
  tokenTab,
  hasTokenData = false,
  activeTab = 'readme',
  onTabChange,
  sidebar,
  atoms
}: SkillTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
        <TabsTrigger
          value="readme"
          data-testid="tab-readme"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2">
          Readme
        </TabsTrigger>
        <TabsTrigger
          value="versions"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2">
          Versions
        </TabsTrigger>
        <TabsTrigger
          value="files"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2">
          Files
        </TabsTrigger>
        {atoms && atoms.length > 0 && (
          <TabsTrigger
            value="atoms"
            data-testid="atoms-tab-trigger"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2">
            Atoms
          </TabsTrigger>
        )}
        {hasSecurityData && (
          <TabsTrigger
            value="security"
            data-testid="tab-security"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2">
            Security
          </TabsTrigger>
        )}
        {hasTokenData && (
          <TabsTrigger
            value="tokens"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2">
            Tokens
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="readme" className="mt-6">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
          <div className="flex-1 min-w-0 w-full">
            {readmeContent ? (
              <div data-testid="readme-root">
                <SkillReadme content={readmeContent} />
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground" data-testid="readme-root">
                <p className="text-lg font-medium mb-1">No README</p>
                <p className="text-sm">
                  This skill doesn&apos;t have a README yet. Add a SKILL.md to your package and re-publish.
                </p>
              </div>
            )}
          </div>
          <div className="hidden lg:block">{sidebar}</div>
        </div>
      </TabsContent>

      <TabsContent value="versions" className="mt-6">
        <div className="overflow-x-auto" data-testid="versions-scroll-container">
          <VersionHistory versions={versions} />
        </div>
      </TabsContent>

      <TabsContent value="files" className="mt-6">
        <div data-testid="file-explorer-root">
          <FileExplorer files={files} skillName={skillName} version={version} readme={readme} manifest={manifest} />
        </div>
      </TabsContent>

      {atoms && atoms.length > 0 && (
        <TabsContent value="atoms" className="mt-6">
          <AtomsTab atoms={atoms} data-testid="atoms-tab-intro" />
        </TabsContent>
      )}

      {hasSecurityData && securityTab && (
        <TabsContent value="security" className="mt-6">
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
            <div className="flex-1 min-w-0 w-full">{securityTab}</div>
            <div className="hidden lg:block">{sidebar}</div>
          </div>
        </TabsContent>
      )}

      {hasTokenData && tokenTab && (
        <TabsContent value="tokens" className="mt-6">
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
            <div className="flex-1 min-w-0 w-full">{tokenTab}</div>
            <div className="hidden lg:block">{sidebar}</div>
          </div>
        </TabsContent>
      )}
    </Tabs>
  );
}
