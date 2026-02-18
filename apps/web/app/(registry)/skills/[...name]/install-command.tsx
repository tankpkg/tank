'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

export function InstallCommand({ name }: { name: string }) {
  const projectCommand = `tank install ${name}`;
  const globalCommand = `tank install -g ${name}`;
  const [copied, setCopied] = useState<'project' | 'global' | null>(null);

  const handleCopy = async (
    command: string,
    target: 'project' | 'global'
  ) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(target);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard API not available — ignore silently
    }
  };

  return (
    <Tabs defaultValue="project" className="w-full">
      <TabsList className="h-8">
        <TabsTrigger value="project" className="px-2 text-xs">
          Project
        </TabsTrigger>
        <TabsTrigger value="global" className="px-2 text-xs">
          Global
        </TabsTrigger>
      </TabsList>
      <TabsContent value="project">
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <code className="text-sm font-mono select-all text-foreground bg-background/50 px-2 py-1 rounded">
              {projectCommand}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(projectCommand, 'project')}
              className="shrink-0"
            >
              {copied === 'project' ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Installs to project and links to your AI agents
          </p>
        </div>
      </TabsContent>
      <TabsContent value="global">
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <code className="text-sm font-mono select-all text-foreground bg-background/50 px-2 py-1 rounded">
              {globalCommand}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(globalCommand, 'global')}
              className="shrink-0"
            >
              {copied === 'global' ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Installs globally — available to all projects and agents
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );
}
