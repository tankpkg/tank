import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Terminal,
  Lock,
  Eye,
  GitBranch,
  Zap,
  Globe,
  ChevronRight,
  ArrowRight,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

const features = [
  {
    icon: Lock,
    title: 'Integrity Verification',
    description:
      'Every skill pinned with sha512 hashes. If content doesn\'t match, installation fails. No silent tampering.',
  },
  {
    icon: Shield,
    title: 'Permission Budgets',
    description:
      'Declare what your agent can do — network, filesystem, subprocess. Skills exceeding the budget are rejected.',
  },
  {
    icon: Eye,
    title: 'Audit Scores',
    description:
      'Transparent 0–10 security score. Code signing, static analysis, reproducible builds — all visible.',
  },
  {
    icon: GitBranch,
    title: 'Enforced Semver',
    description:
      'Not a social contract — enforced. A patch that adds network access? Rejected. Breaking changes require major bump.',
  },
  {
    icon: Terminal,
    title: 'CLI-First Workflow',
    description:
      'Install, publish, audit, manage permissions from terminal. Designed for developers, not dashboards.',
  },
  {
    icon: Globe,
    title: 'Open Source (MIT)',
    description:
      'Built in the open from day one. MIT licensed. Community-driven security reviews. No vendor lock-in.',
  },
];

const cliCommands = [
  { cmd: 'tank install @vercel/next-skill', desc: 'Install with integrity verification' },
  { cmd: 'tank permissions', desc: 'See what your agent can do' },
  { cmd: 'tank audit', desc: 'Check signatures & vulnerabilities' },
  { cmd: 'tank publish', desc: 'Publish with signing & analysis' },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background tank-gradient-bg tank-grid-overlay">
      {/* Decorative orbs - Matrix green only */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="tank-orb tank-orb-green w-[600px] h-[600px] -top-48 -left-48 opacity-30" />
        <div className="tank-orb tank-orb-green w-[500px] h-[500px] top-1/3 -right-32 opacity-20" />
        <div className="tank-orb tank-orb-green w-[400px] h-[400px] bottom-0 left-1/4 opacity-25" />
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-emerald-500/10 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight hover:opacity-80 transition-all group">
              <div className="relative">
                <Image src="/logo.png" alt="Tank" width={28} height={28} className="rounded-sm" />
              </div>
              <span>Tank</span>
            </Link>
            <nav className="hidden md:flex items-center gap-8 text-sm">
              <Link
                href="/skills"
                className="text-muted-foreground hover:text-emerald-400 transition-colors flex items-center gap-1.5"
              >
                Browse Skills
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/docs/user-flow"
                className="text-muted-foreground hover:text-emerald-400 transition-colors flex items-center gap-1.5"
              >
                User Guide
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <a
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </a>
            </nav>
            <div className="flex items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button size="sm" asChild className="bg-emerald-600 hover:bg-emerald-500 text-white">
                <Link href="/skills">Get Started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* Hero Section */}
        <section className="tank-hero-gradient tank-data-stream relative overflow-hidden">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-16 md:pt-24 md:pb-24">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 mb-8">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-400">Early Development — Building in the open</span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                <span className="block">Security-first</span>
                <span className="block text-emerald-400">package manager</span>
                <span className="block mt-2">for AI agent skills</span>
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
                Today&apos;s skill registries have no versioning, no lockfiles, no permissions, and no
                code signing. <span className="text-foreground font-medium">Tank is the npm for agent skills</span> —
                with security built in from day one.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" asChild className="bg-emerald-600 hover:bg-emerald-500 text-white group">
                  <Link href="/login">
                    Get Started
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="/skills">Browse Skills</Link>
                </Button>
              </div>

              {/* Terminal preview hint */}
              <div className="mt-12">
                <p className="text-xs text-muted-foreground/60 font-mono">
                  <span className="text-emerald-400">$</span> tank install @tank/security-audit
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Code Example — skills.json */}
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                Declare what your agent is{' '}
                <span className="text-emerald-400">allowed to do</span>
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
                  skills.json
                </code>{' '}
                is like package.json — but with a{' '}
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
                  permissions
                </code>{' '}
                field. If any skill exceeds the budget, installation fails.
              </p>
            </div>

            <div className="tank-terminal tank-scanlines rounded-xl overflow-hidden">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-500/20 bg-[#0c1222]">
                <span className="size-3 rounded-full bg-red-500/80" />
                <span className="size-3 rounded-full bg-amber-500/80" />
                <span className="size-3 rounded-full bg-emerald-500/80" />
                <span className="ml-3 text-xs text-emerald-400/60 font-mono">skills.json</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs text-emerald-400/60">verified</span>
                </div>
              </div>

              {/* Code content */}
              <pre className="p-4 md:p-6 text-sm md:text-base overflow-x-auto leading-relaxed font-mono">
                <code>
                  <span className="text-slate-500">{'{'}</span>
                  {'\n'}
                  {'  '}<span className="text-emerald-400">"skills"</span><span className="text-slate-500">: {'{'}</span>
                  {'\n'}
                  {'    '}<span className="text-emerald-400">"@vercel/next-skill"</span><span className="text-slate-500">:</span> <span className="text-amber-400">"^2.1.0"</span><span className="text-slate-500">,</span>
                  {'\n'}
                  {'    '}<span className="text-emerald-400">"@community/seo-audit"</span><span className="text-slate-500">:</span> <span className="text-amber-400">"3.0.0"</span>
                  {'\n'}
                  {'  '}<span className="text-slate-500">{'],'}</span>
                  {'\n'}
                  {'  '}<span className="text-emerald-400">"permissions"</span><span className="text-slate-500">: {'{'}</span>
                  {'\n'}
                  {'    '}<span className="text-emerald-400">"network"</span><span className="text-slate-500">: {'{'}</span> <span className="text-emerald-400">"outbound"</span><span className="text-slate-500">:</span> <span className="text-amber-400">["*.anthropic.com"]</span> <span className="text-slate-500">{'],'}</span>
                  {'\n'}
                  {'    '}<span className="text-emerald-400">"filesystem"</span><span className="text-slate-500">: {'{'}</span>
                  {'\n'}
                  {'      '}<span className="text-emerald-400">"read"</span><span className="text-slate-500">:</span> <span className="text-amber-400">["./src/**"]</span><span className="text-slate-500">,</span>
                  {'\n'}
                  {'      '}<span className="text-emerald-400">"write"</span><span className="text-slate-500">:</span> <span className="text-amber-400">["./output/**"]</span>
                  {'\n'}
                  {'    '}<span className="text-slate-500">{'],'}</span>
                  {'\n'}
                  {'    '}<span className="text-emerald-400">"subprocess"</span><span className="text-slate-500">:</span> <span className="text-pink-400">false</span>
                  {'\n'}
                  {'  '}<span className="text-slate-500">{'],'}</span>
                  {'\n'}
                  <span className="text-slate-500">{')'}</span>
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="container mx-auto px-4 pb-16 md:pb-24">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <Shield className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
              Security at <span className="text-emerald-400">every layer</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              From publish to install to runtime — every step is verified, signed, and sandboxed.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className="tank-card bg-card/50 backdrop-blur-sm hover:bg-card/80 group"
              >
                <CardHeader>
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-3 group-hover:bg-emerald-500/20 transition-colors">
                    <feature.icon className="h-5 w-5 text-emerald-400" />
                  </div>
                  <CardTitle className="text-base">{feature.title}</CardTitle>
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
        <section className="relative py-16 md:py-24 overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/5 to-transparent" />

          <div className="container mx-auto px-4 relative">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
                  <Terminal className="w-6 h-6 text-emerald-400" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                  Get started in <span className="text-emerald-400">seconds</span>
                </h2>
                <p className="text-muted-foreground">
                  Everything you need, right from the terminal.
                </p>
              </div>

              <div className="tank-terminal tank-scanlines rounded-xl overflow-hidden">
                {/* Terminal header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-500/20 bg-[#0c1222]">
                  <span className="size-3 rounded-full bg-red-500/80" />
                  <span className="size-3 rounded-full bg-amber-500/80" />
                  <span className="size-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-3 text-xs text-emerald-400/60 font-mono">tank-cli</span>
                </div>

                <div className="p-4 md:p-6 space-y-4">
                  {cliCommands.map((item) => (
                    <div key={item.cmd} className="group">
                      <p className="text-xs text-slate-500 mb-1 font-mono"># {item.desc}</p>
                      <p className="text-sm md:text-base font-mono flex items-center gap-2">
                        <span className="text-emerald-400 select-none">$</span>
                        <span className="text-slate-200 group-hover:text-white transition-colors">{item.cmd}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem Statement / Why Tank */}
        <section className="relative">
          <div className="tank-divider" />
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
                <Shield className="w-6 h-6 text-red-400" />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">
                Agent skills are <span className="text-red-400">more dangerous</span> than npm packages
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-8 text-lg">
                A malicious npm package runs inside your app&apos;s sandbox. A malicious agent skill
                runs with the <span className="text-foreground font-medium">agent&apos;s full permissions</span> — reading any file, making API calls with
                your credentials, executing shell commands.
              </p>

              <div className="inline-flex flex-col sm:flex-row items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  <span className="text-red-400 font-semibold text-sm">ClawHavoc (Feb 2026)</span>
                </div>
                <span className="hidden sm:inline text-red-500/30">|</span>
                <span className="text-muted-foreground text-sm">
                  341 malicious skills — 12% of a major marketplace — distributing credential-stealing malware.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden">
          <div className="tank-divider" />
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="max-w-2xl mx-auto text-center relative">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                Ready to <span className="text-emerald-400">secure</span> your agent skills?
              </h2>
              <p className="text-muted-foreground mb-8 text-lg">
                Tank is open source and free. Start publishing and installing skills with confidence.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" asChild className="bg-emerald-600 hover:bg-emerald-500 text-white group">
                  <Link href="/login">
                    Get Started
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <a
                    href="https://github.com/tankpkg/tank"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg className="mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    View on GitHub
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-emerald-500/10 bg-background/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
              <Link href="/" className="flex items-center gap-2 font-semibold text-foreground hover:opacity-80 transition-opacity group">
                <Image src="/logo.png" alt="Tank" width={20} height={20} className="rounded-sm" />
                <span>Tank</span>
              </Link>
              <span className="hidden sm:inline text-muted-foreground/30">•</span>
              <span className="sm:hidden text-muted-foreground/30">—</span>
              <span>Security-first package manager for AI agent skills</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/skills" className="hover:text-emerald-400 transition-colors">
                Skills
              </Link>
              <Link href="/docs/user-flow" className="hover:text-emerald-400 transition-colors">
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
