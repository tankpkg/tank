'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import type { SkillVersionSummary } from '@/lib/data/skills';
import type { ReactNode } from 'react';
import { FileExplorer } from './file-explorer';
import { SkillReadme } from './skill-readme';

interface SkillTabsProps {
  readmeContent: string | null;
  versions: SkillVersionSummary[];
  files: string[];
  skillName: string;
  version: string;
  readme: string | null;
  manifest?: Record<string, unknown>;
  securityTab?: ReactNode;
  hasSecurityData?: boolean;
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAuditScore(score: number | null): string {
  if (score === null || score === undefined) return '-';
  return `${score}/10`;
}

function VersionHistory({ versions }: { versions: SkillVersionSummary[] }) {
  if (versions.length === 0) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Version</TableHead>
          <TableHead>Published</TableHead>
          <TableHead>Audit Score</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {versions.map((v) => (
          <TableRow key={v.version}>
            <TableCell className="font-mono font-medium">{v.version}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(v.publishedAt)}
            </TableCell>
            <TableCell>{formatAuditScore(v.auditScore)}</TableCell>
            <TableCell>
              <Badge
                variant={
                  v.auditStatus === 'published' || v.auditStatus === 'completed'
                    ? 'secondary'
                    : 'outline'
                }
              >
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
}: SkillTabsProps) {
  return (
    <Tabs defaultValue="readme" className="w-full">
      <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
        <TabsTrigger
          value="readme"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2"
        >
          Readme
        </TabsTrigger>
        <TabsTrigger
          value="versions"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2"
        >
          Versions
        </TabsTrigger>
        <TabsTrigger
          value="files"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2"
        >
          Files
        </TabsTrigger>
        {hasSecurityData && (
          <TabsTrigger
            value="security"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2"
          >
            Security
          </TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="readme" className="mt-6">
        {readmeContent ? (
          <div data-testid="readme-root">
            <SkillReadme content={readmeContent} />
          </div>
        ) : (
          <div
            className="py-12 text-center text-muted-foreground"
            data-testid="readme-root"
          >
            <p className="text-lg font-medium mb-1">No README</p>
            <p className="text-sm">
              This skill doesn&apos;t have a README yet. Add a SKILL.md to your
              package and re-publish.
            </p>
          </div>
        )}
      </TabsContent>
      <TabsContent value="versions" className="mt-6">
        <VersionHistory versions={versions} />
      </TabsContent>
      <TabsContent value="files" className="mt-6">
        <div data-testid="file-explorer-root">
          <FileExplorer
            files={files}
            skillName={skillName}
            version={version}
            readme={readme}
            manifest={manifest}
          />
        </div>
      </TabsContent>
      {hasSecurityData && securityTab && (
        <TabsContent value="security" className="mt-6">
          {securityTab}
        </TabsContent>
      )}
    </Tabs>
  );
}
