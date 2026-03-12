import { eq } from 'drizzle-orm';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  GitBranch,
  Globe,
  HelpCircle,
  Lock,
  Shield,
  Star,
  Terminal
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { SearchTrigger } from '@/components/search-trigger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/db';
import { skills } from '@/lib/db/schema';
import { CookiePreferencesButton } from './cookie-preferences-button';
import { CopyInstallButton } from './copy-install-button';
import { HomeNavAuthCta, HomePrimaryAuthCta } from './home-auth-cta';

const GITHUB_REPO = 'tankpkg/tank';
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.tankpkg.dev';

async function getGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

const features = [
  {
    icon: Lock,
    title: 'Integrity Verification',
    description:
      "Every skill pinned with sha512 hashes. If content doesn't match, installation fails. No silent tampering."
  },
  {
    icon: Shield,
    title: 'Permission Budgets',
    description:
      'Declare what your agent can do — network, filesystem, subprocess. Skills exceeding the budget are rejected.'
  },
  {
    icon: Eye,
    title: 'Audit Scores',
    description: 'Transparent 0–10 security score. Static analysis, permission matching, package hygiene — all visible.'
  },
  {
    icon: GitBranch,
    title: 'Enforced Semver',
    description:
      'Not a social contract. A patch that adds network access? Detected and flagged. Permission escalation requires a major bump.'
  },
  {
    icon: Terminal,
    title: 'CLI-First Workflow',
    description: 'Install, publish, audit, manage permissions from terminal. Designed for developers, not dashboards.'
  },
  {
    icon: Globe,
    title: 'Open Source (MIT)',
    description: 'Built in the open from day one. MIT licensed. Transparent scanning. No vendor lock-in.'
  }
];

const installCommand = 'curl -fsSL https://raw.githubusercontent.com/tankpkg/tank/main/install.sh | sh';

const cliCommands = [
  { cmd: 'tank install @vercel/next-skill', desc: 'Install with integrity verification' },
  { cmd: 'tank permissions', desc: 'See what your agent can do' },
  { cmd: 'tank audit', desc: 'Check security scan results' },
  { cmd: 'tank publish', desc: 'Publish with 6-stage analysis' }
];

const faqItems = [
  {
    question: 'What is Tank?',
    answer:
      'Tank is a security-first package manager for AI agent skills. It provides integrity verification (SHA-512), permission budgets, 6-stage security scanning, and enforced semver \u2014 features that current skill registries lack.'
  },
  {
    question: 'How is this different from npm?',
    answer:
      'npm manages JavaScript packages. Tank manages AI agent skills \u2014 the reusable capabilities you add to coding agents like Claude Code or Cursor. Unlike npm, Tank enforces permission budgets and scans every package through a 6-stage security pipeline before publication.'
  },
  {
    question: 'Is Tank free?',
    answer:
      'Yes. Tank is open source under the MIT license. The registry, CLI, and security scanner are all free to use.'
  },
  {
    question: 'How does the security scanning work?',
    answer:
      'Every skill goes through 6 stages: ingestion (SHA-512 hashing), structure validation, static analysis (Semgrep + Bandit), injection detection, secrets scanning (detect-secrets), and dependency audit (OSV). Skills receive a 0\u201310 audit score and a verdict: PASS, FLAGGED, or FAIL.'
  },
  {
    question: 'Who built Tank?',
    answer:
      'Tank is built by developers who saw the ClawHavoc incident \u2014 where 341 malicious skills (12% of a major marketplace) distributed credential-stealing malware \u2014 and decided AI agent skills deserved the same security infrastructure as npm packages.'
  }
];

function buildHomepageJsonLd(_skillCount: number) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'Tank',
        url: BASE_URL,
        logo: `${BASE_URL}/logo.png`,
        description:
          'Security-first package registry for AI agent skills. Prevent credential exfiltration and supply chain attacks with mandatory security scanning.',
        sameAs: ['https://github.com/tankpkg', 'https://x.com/tankpkg']
      },
      {
        '@type': 'WebSite',
        name: 'Tank',
        url: BASE_URL,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${BASE_URL}/skills?q={search_term_string}`,
          'query-input': 'required name=search_term_string'
        }
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer
          }
        }))
      }
    ]
  };
}

export default async function Home() {
  let skillCount = 0;
  try {
    const result = await db.select({ name: skills.name }).from(skills).where(eq(skills.visibility, 'public'));
    skillCount = result.length;
  } catch {
    // DB unavailable at build time
  }

  const starCount = await getGitHubStars();

  const homepageJsonLd = buildHomepageJsonLd(skillCount);
  return (
    <div className="min-h-screen bg-background tank-gradient-bg tank-grid-overlay">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageJsonLd) }} />
      {/* Decorative orbs - Matrix green only */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="tank-orb tank-orb-green w-[600px] h-[600px] -top-48 -left-48 opacity-30" />
        <div className="tank-orb tank-orb-green w-[500px] h-[500px] top-1/3 -right-32 opacity-20" />
        <div className="tank-orb tank-orb-green w-[400px] h-[400px] bottom-0 left-1/4 opacity-25" />
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-emerald-500/10 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className="h-16"
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
              <Link
                href="/"
                className="flex items-center gap-2.5 font-bold text-lg tracking-tight hover:opacity-80 transition-all group">
                <div className="relative">
                  <Image src="/logo.png" alt="Tank" width={28} height={28} className="rounded-sm" />
                </div>
                <span>Tank</span>
              </Link>
              <Navbar />
            </div>
            <div
              className="max-lg:hidden"
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '100%',
                maxWidth: '28rem',
                pointerEvents: 'auto'
              }}>
              <SearchTrigger />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
              <a
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all"
                aria-label="Star Tank on GitHub">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <title>GitHub</title>
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Star</span>
                {starCount !== null && <span className="font-medium tabular-nums text-emerald-400">{starCount}</span>}
              </a>
              <HomeNavAuthCta />
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
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-400">
                  {skillCount >= 5
                    ? `${skillCount} Security-Verified Skills \u00b7 Open Source`
                    : 'Open Source \u00b7 MIT Licensed'}
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                <span className="block">Security-first</span>
                <span className="block text-emerald-400">package manager</span>
                <span className="block mt-2">for AI agent skills</span>
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
                Today&apos;s skill registries have no versioning, no lockfiles, no permissions, and no security
                scanning. <span className="text-foreground font-medium">Tank is the npm for agent skills</span> — with
                security built in from day one.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  size="lg"
                  asChild
                  className="bg-emerald-600 hover:bg-emerald-500 text-white group"
                  data-testid="home-primary-cta">
                  <Link href="/skills">
                    Browse Skills
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
                <HomePrimaryAuthCta testId="home-secondary-cta" />
              </div>

              {/* Install command */}
              <div className="mt-12 flex flex-col items-center gap-4">
                <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
                  <p className="text-xs sm:text-sm text-muted-foreground font-mono">
                    <span className="text-emerald-400 select-none">$ </span>
                    <span className="text-slate-300">{installCommand}</span>
                  </p>
                  <CopyInstallButton command={installCommand} />
                </div>
                <a
                  href="https://github.com/tankpkg/tank"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-emerald-400 transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Star on GitHub{starCount !== null ? ` (${starCount})` : ''}</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        {skillCount > 0 && (
          <section className="container mx-auto px-4 py-8">
            <div className="max-w-2xl mx-auto flex items-center justify-center gap-8 sm:gap-12 text-center">
              <div>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-2xl font-bold text-foreground">{skillCount}</span>
                </div>
                <span className="text-xs text-muted-foreground">Skills Published</span>
              </div>
              <div className="h-8 w-px bg-emerald-500/20" />
              <div>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span className="text-2xl font-bold text-foreground">{skillCount}</span>
                </div>
                <span className="text-xs text-muted-foreground">Security Scans</span>
              </div>
              <div className="h-8 w-px bg-emerald-500/20" />
              <div>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span className="text-2xl font-bold text-foreground">MIT</span>
                </div>
                <span className="text-xs text-muted-foreground">Open Source</span>
              </div>
            </div>
          </section>
        )}

        {/* Code Example — tank.json */}
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                Declare what your agent is <span className="text-emerald-400">allowed to do</span>
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">tank.json</code> is like package.json
                — but with a <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">permissions</code>{' '}
                field. If any skill exceeds the budget, installation fails.
              </p>
            </div>

            <div className="tank-terminal tank-scanlines rounded-xl overflow-hidden">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-500/20 bg-[#0c1222]">
                <span className="size-3 rounded-full bg-red-500/80" />
                <span className="size-3 rounded-full bg-amber-500/80" />
                <span className="size-3 rounded-full bg-emerald-500/80" />
                <span className="ml-3 text-xs text-emerald-400/60 font-mono">tank.json</span>
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
                  {'  '}
                  <span className="text-emerald-400">"skills"</span>
                  <span className="text-slate-500">: {'{'}</span>
                  {'\n'}
                  {'    '}
                  <span className="text-emerald-400">"@vercel/next-skill"</span>
                  <span className="text-slate-500">:</span> <span className="text-amber-400">"^2.1.0"</span>
                  <span className="text-slate-500">,</span>
                  {'\n'}
                  {'    '}
                  <span className="text-emerald-400">"@community/seo-audit"</span>
                  <span className="text-slate-500">:</span> <span className="text-amber-400">"3.0.0"</span>
                  {'\n'}
                  {'  '}
                  <span className="text-slate-500">{'}'}</span>
                  {'\n'}
                  {'  '}
                  <span className="text-emerald-400">"permissions"</span>
                  <span className="text-slate-500">: {'{'}</span>
                  {'\n'}
                  {'    '}
                  <span className="text-emerald-400">"network"</span>
                  <span className="text-slate-500">: {'{'}</span> <span className="text-emerald-400">"outbound"</span>
                  <span className="text-slate-500">:</span> <span className="text-amber-400">["*.anthropic.com"]</span>{' '}
                  <span className="text-slate-500">{'}'}</span>
                  {'\n'}
                  {'    '}
                  <span className="text-emerald-400">"filesystem"</span>
                  <span className="text-slate-500">: {'{'}</span>
                  {'\n'}
                  {'      '}
                  <span className="text-emerald-400">"read"</span>
                  <span className="text-slate-500">:</span> <span className="text-amber-400">["./src/**"]</span>
                  <span className="text-slate-500">,</span>
                  {'\n'}
                  {'      '}
                  <span className="text-emerald-400">"write"</span>
                  <span className="text-slate-500">:</span> <span className="text-amber-400">["./output/**"]</span>
                  {'\n'}
                  {'    '}
                  <span className="text-slate-500">{'}'}</span>
                  {'\n'}
                  {'    '}
                  <span className="text-emerald-400">"subprocess"</span>
                  <span className="text-slate-500">:</span> <span className="text-pink-400">false</span>
                  {'\n'}
                  {'  '}
                  <span className="text-slate-500">{'}'}</span>
                  {'\n'}
                  <span className="text-slate-500">{'}'}</span>
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
              From publish to install — every skill is scanned, scored, and verified.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {features.map((feature) => (
              <Card key={feature.title} className="tank-card bg-card/50 backdrop-blur-sm hover:bg-card/80 group">
                <CardHeader>
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-3 group-hover:bg-emerald-500/20 transition-colors">
                    <feature.icon className="h-5 w-5 text-emerald-400" />
                  </div>
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="-mt-2">
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
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
                <p className="text-muted-foreground">Everything you need, right from the terminal.</p>
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
                  <div className="group">
                    <p className="text-xs text-slate-500 mb-1 font-mono"># Install Tank CLI</p>
                    <p className="text-sm md:text-base font-mono flex items-center gap-2">
                      <span className="text-emerald-400 select-none">$</span>
                      <span className="text-slate-200 group-hover:text-white transition-colors">{installCommand}</span>
                    </p>
                  </div>
                  <div className="border-t border-emerald-500/10" />
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
                A malicious npm package runs inside your app&apos;s sandbox. A malicious agent skill runs with the{' '}
                <span className="text-foreground font-medium">agent&apos;s full permissions</span> — reading any file,
                making API calls with your credentials, executing shell commands.
              </p>

              <div className="inline-flex flex-col sm:flex-row items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
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

        {/* FAQ */}
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
                <HelpCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                Frequently Asked <span className="text-emerald-400">Questions</span>
              </h2>
            </div>
            <div className="space-y-6">
              {faqItems.map((item) => (
                <div key={item.question} className="border border-emerald-500/10 rounded-lg p-5 bg-card/30">
                  <h3 className="font-semibold text-base mb-2">{item.question}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
                </div>
              ))}
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
                  <Link href="/skills">
                    Browse Skills
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <a href="https://github.com/tankpkg/tank" target="_blank" rel="noopener noreferrer">
                    <Star className="mr-2 h-4 w-4" />
                    Star on GitHub{starCount !== null ? ` (${starCount})` : ''}
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
              <Link
                href="/"
                className="flex items-center gap-2 font-semibold text-foreground hover:opacity-80 transition-opacity group">
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
              <Link href="/docs" className="hover:text-emerald-400 transition-colors">
                Docs
              </Link>
              <a
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
                GitHub
              </a>
              <CookiePreferencesButton />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
