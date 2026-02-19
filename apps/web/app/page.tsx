import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const features = [
  {
    icon: '🔒',
    title: 'Integrity Verification',
    description:
      'Every skill is pinned with sha512 hashes in skills.lock. If content doesn\'t match its hash, installation fails. No silent tampering.',
  },
  {
    icon: '🛡️',
    title: 'Permission Budgets',
    description:
      'Declare what your agent is allowed to do — network, filesystem, subprocess. If any skill exceeds the budget, installation fails.',
  },
  {
    icon: '📊',
    title: 'Audit Scores',
    description:
      'Transparent 0–10 security score for every skill. Code signing, static analysis, reproducible builds, vulnerability checks — all visible.',
  },
  {
    icon: '📦',
    title: 'Enforced Semver',
    description:
      'Not a social contract — enforced. A patch that adds network access? Rejected. Breaking changes require a major bump.',
  },
  {
    icon: '⚡',
    title: 'CLI-First Workflow',
    description:
      'Install, publish, audit, and manage permissions from the terminal. Designed for developers, not dashboards.',
  },
  {
    icon: '🌐',
    title: 'Open Source (MIT)',
    description:
      'Built in the open from day one. MIT licensed. Community-driven security reviews. No vendor lock-in.',
  },
];

const skillsJsonExample = `{
  "skills": {
    "@vercel/next-skill": "^2.1.0",
    "@community/seo-audit": "3.0.0"
  },
  "permissions": {
    "network": {
      "outbound": ["*.anthropic.com"]
    },
    "filesystem": {
      "read": ["./src/**"],
      "write": ["./output/**"]
    },
    "subprocess": false
  }
}`;

const cliCommands = [
  { cmd: 'tank install @vercel/next-skill', desc: 'Install with full integrity verification' },
  { cmd: 'tank permissions', desc: 'See exactly what your agent is allowed to do' },
  { cmd: 'tank audit', desc: 'Check signatures, vulnerabilities, permission escalations' },
  { cmd: 'tank publish', desc: 'Publish with mandatory signing and static analysis' },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="border-b sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-80 transition-opacity">
              <Image src="/logo.png" alt="Tank" width={28} height={28} className="rounded-sm" />
              Tank
            </Link>
            <nav className="hidden md:flex items-center gap-8 text-sm">
              <Link
                href="/skills"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Browse Skills
              </Link>
              <Link
                href="/docs/user-flow"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                User Guide
              </Link>
              <a
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                GitHub
              </a>
            </nav>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="GitHub"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </Link>
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/skills">Get Started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="container mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-16 md:pt-24 md:pb-24">
          <div className="max-w-3xl mx-auto text-center">
            <Badge variant="secondary" className="mb-6">
              Early Development — Building in the open
            </Badge>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Security-first package manager for{' '}
              <span className="text-primary">AI agent skills</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              Today&apos;s skill registries have no versioning, no lockfiles, no permissions, and no
              code signing. Tank is the npm for agent skills — with security built in from day one.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" asChild>
                <Link href="/login">Get Started</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/skills">Browse Skills</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Code Example — skills.json */}
        <section className="container mx-auto px-4 pb-16 md:pb-24">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                Declare what your agent is allowed to do
              </h2>
              <p className="text-muted-foreground">
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
                  skills.json
                </code>{' '}
                is like{' '}
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
                  package.json
                </code>{' '}
                — but with a{' '}
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
                  permissions
                </code>{' '}
                field. If any skill exceeds the budget, installation fails.
              </p>
            </div>
            <div className="rounded-lg border bg-[#0f172a] text-slate-100 overflow-hidden shadow-lg">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700 bg-[#1e293b]">
                <span className="size-3 rounded-full bg-red-500/80" />
                <span className="size-3 rounded-full bg-yellow-500/80" />
                <span className="size-3 rounded-full bg-green-500/80" />
                <span className="ml-3 text-xs text-slate-400 font-mono">skills.json</span>
              </div>
              <pre className="p-4 md:p-6 text-sm md:text-base overflow-x-auto leading-relaxed">
                <code>{skillsJsonExample}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="container mx-auto px-4 pb-16 md:pb-24">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
              Security at every layer
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              From publish to install to runtime — every step is verified, signed, and sandboxed.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {features.map((feature) => (
              <Card key={feature.title} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5 text-base">
                    <span className="text-xl" role="img" aria-label={feature.title}>
                      {feature.icon}
                    </span>
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="-mt-2">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CLI Quick Start */}
        <section className="container mx-auto px-4 pb-16 md:pb-24">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                Get started in seconds
              </h2>
              <p className="text-muted-foreground">
                Everything you need, right from the terminal.
              </p>
            </div>
            <div className="rounded-lg border bg-[#0f172a] text-slate-100 overflow-hidden shadow-lg">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700 bg-[#1e293b]">
                <span className="size-3 rounded-full bg-red-500/80" />
                <span className="size-3 rounded-full bg-yellow-500/80" />
                <span className="size-3 rounded-full bg-green-500/80" />
                <span className="ml-3 text-xs text-slate-400 font-mono">terminal</span>
              </div>
              <div className="p-4 md:p-6 space-y-4">
                {cliCommands.map((item) => (
                  <div key={item.cmd}>
                    <p className="text-xs text-slate-500 mb-1 font-mono"># {item.desc}</p>
                    <p className="text-sm md:text-base font-mono">
                      <span className="text-green-400">$</span>{' '}
                      <span className="text-slate-100">{item.cmd}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Problem Statement / Why Tank */}
        <section className="border-y bg-muted/40">
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                Agent skills are more dangerous than npm packages
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                A malicious npm package runs inside your app&apos;s sandbox. A malicious agent skill
                runs with the agent&apos;s full permissions — reading any file, making API calls with
                your credentials, executing shell commands. The attack surface is fundamentally
                larger.
              </p>
              <div className="inline-flex items-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm">
                <span className="text-destructive font-semibold">ClawHavoc (Feb 2026):</span>
                <span className="text-muted-foreground">
                  341 malicious skills — 12% of a major marketplace — distributing credential-stealing malware.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
              Ready to secure your agent skills?
            </h2>
            <p className="text-muted-foreground mb-8">
              Tank is open source and free. Start publishing and installing skills with confidence.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" asChild>
                <Link href="/login">Get Started</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <a
                  href="https://github.com/tankpkg/tank"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on GitHub
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
              <Link href="/" className="flex items-center gap-1.5 font-semibold text-foreground hover:opacity-80 transition-opacity">
                <Image src="/logo.png" alt="Tank" width={20} height={20} className="rounded-sm" />
                Tank
              </Link>
              <span className="hidden sm:inline text-muted-foreground/50">•</span>
              <span className="sm:hidden text-muted-foreground/50">—</span>
              <span>Security-first package manager for AI agent skills</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/skills" className="hover:text-foreground transition-colors">
                Skills
              </Link>
              <Link href="/docs/user-flow" className="hover:text-foreground transition-colors">
                User Guide
              </Link>
              <a
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
