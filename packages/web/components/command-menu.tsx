'use client';

import {
  BookIcon,
  BookOpenIcon,
  BoxIcon,
  CloudIcon,
  FileTextIcon,
  GithubIcon,
  KeyIcon,
  LayoutDashboardIcon,
  LogInIcon,
  PackageSearchIcon,
  RocketIcon,
  ServerIcon,
  ShieldCheckIcon,
  TerminalIcon,
  WrenchIcon
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command';

interface SkillResult {
  name: string;
  description?: string;
  owner?: string;
}

interface SearchApiItem {
  name: string;
  description?: string | null;
  owner?: string;
  ownerName?: string;
}

interface SearchApiResponse {
  skills?: SearchApiItem[];
  results?: SearchApiItem[];
}

const DOC_PAGES = [
  { title: 'Getting Started', slug: 'getting-started', icon: RocketIcon },
  { title: 'Installing Skills', slug: 'installing', icon: PackageSearchIcon },
  { title: 'Publishing Skills', slug: 'publishing', icon: BoxIcon },
  { title: 'Publish Your First Skill', slug: 'publish-first-skill', icon: BookOpenIcon },
  { title: 'CLI Reference', slug: 'cli', icon: TerminalIcon },
  { title: 'API Reference', slug: 'api', icon: FileTextIcon },
  { title: 'MCP Server', slug: 'mcp', icon: WrenchIcon },
  { title: 'CI/CD Integration', slug: 'cicd', icon: CloudIcon },
  { title: 'Security Checklist', slug: 'security-checklist', icon: ShieldCheckIcon },
  { title: 'Self-Hosting', slug: 'self-hosting', icon: ServerIcon },
  { title: 'Self-Host Quickstart', slug: 'self-host-quickstart', icon: KeyIcon },
  { title: 'Documentation Home', slug: '', icon: BookIcon }
] as const;

const QUICK_LINKS = [
  { title: 'Browse Skills', href: '/skills', icon: PackageSearchIcon },
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboardIcon },
  { title: 'Documentation', href: '/docs', icon: BookOpenIcon },
  { title: 'Sign In', href: '/login', icon: LogInIcon },
  { title: 'GitHub', href: 'https://github.com/tankpkg/tank', icon: GithubIcon, external: true }
] as const;

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [skills, setSkills] = React.useState<SkillResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  React.useEffect(() => {
    if (!query || query.length < 2) {
      setSkills([]);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}&limit=8`, {
          signal: controller.signal
        });
        if (res.ok) {
          const data = (await res.json()) as SearchApiResponse;
          const items: SkillResult[] = (data.skills ?? data.results ?? []).map((skill) => ({
            name: skill.name,
            description: skill.description ?? '',
            owner: skill.owner ?? skill.ownerName ?? ''
          }));
          setSkills(items);
        }
      } catch {
        // AbortController.abort() throws here — expected for debounce
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setSkills([]);
    }
  }, [open]);

  function navigate(href: string, external?: boolean) {
    setOpen(false);
    if (external) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      router.push(href);
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Search skills, docs, and navigate Tank">
      <CommandInput placeholder="Search skills, docs, and more…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{loading ? 'Searching…' : 'No results found.'}</CommandEmpty>

        {skills.length > 0 && (
          <CommandGroup heading="Skills">
            {skills.map((skill) => (
              <CommandItem
                key={skill.name}
                value={`skill-${skill.name}`}
                onSelect={() => navigate(`/skills/${skill.name}`)}>
                <BoxIcon className="text-emerald-500" />
                <div className="flex flex-col">
                  <span className="font-medium">{skill.name}</span>
                  {skill.description && (
                    <span className="text-xs text-muted-foreground line-clamp-1">{skill.description}</span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Documentation">
          {DOC_PAGES.map((doc) => (
            <CommandItem
              key={doc.slug}
              value={`doc-${doc.slug || 'home'}-${doc.title}`}
              onSelect={() => navigate(`/docs/${doc.slug}`)}>
              <doc.icon className="text-blue-500" />
              <span>{doc.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Links">
          {QUICK_LINKS.map((link) => (
            <CommandItem
              key={link.href}
              value={`link-${link.title}`}
              onSelect={() => navigate(link.href, 'external' in link && link.external)}>
              <link.icon className="text-muted-foreground" />
              <span>{link.title}</span>
              {'external' in link && link.external && <span className="ml-auto text-xs text-muted-foreground">↗</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
