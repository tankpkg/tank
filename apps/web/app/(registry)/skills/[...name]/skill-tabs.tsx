'use client';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import type { ReactNode } from 'react';

interface SkillTabsProps {
  readmeTab: ReactNode;
  versionsTab: ReactNode;
  filesTab: ReactNode;
}

export function SkillTabs({
  readmeTab,
  versionsTab,
  filesTab,
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
      </TabsList>
      <TabsContent value="readme" className="mt-6">
        {readmeTab}
      </TabsContent>
      <TabsContent value="versions" className="mt-6">
        {versionsTab}
      </TabsContent>
      <TabsContent value="files" className="mt-6">
        {filesTab}
      </TabsContent>
    </Tabs>
  );
}
