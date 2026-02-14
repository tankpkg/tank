import Link from 'next/link';
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
        <div className="container mx-auto flex h-14 items-center px-4 gap-6">
          <Link href="/" className="font-bold text-lg tracking-tight">
            Tank
          </Link>
          <nav className="hidden sm:flex gap-4 text-sm">
            <Link
              href="/skills"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse Skills
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
          <div className="ml-auto flex items-center gap-3">
            <a
              href="https://github.com/tankpkg/tank"
              target="_blank"
              rel="noopener noreferrer"
              className="sm:hidden text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              GitHub
            </a>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="container mx-auto px-4 pt-20 pb-16 md:pt-32 md:pb-24">
          <div className="max-w-3xl mx-auto text-center">
            <Badge variant="secondary" className="mb-6">
              Early Development — Building in the open
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Security-first package manager for{' '}
              <span className="text-primary">AI agent skills</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
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
      <footer className="border-t">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/" className="font-semibold text-foreground">
                Tank
              </Link>
              <Link href="/skills" className="hover:text-foreground transition-colors">
                Browse Skills
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
            <p className="text-sm text-muted-foreground">
              Built with ❤️ · Open source under MIT
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
