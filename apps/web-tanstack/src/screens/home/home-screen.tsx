import { Link } from '@tanstack/react-router';
import { ArrowRight, CheckCircle2, Globe, HelpCircle, Shield, Star, Terminal } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';

import { CopyInstallButton } from '~/components/copy-install-button';
import { HomePrimaryAuthCta } from '~/components/home-auth-cta';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { GITHUB_ICON_PATH, INSTALL_COMMAND } from '~/consts/brand';
import { cliCommands, faqItems, features } from '~/consts/homepage';

interface HomeScreenProps {
  publicSkillCount: number;
  starCount: number | null;
}

function buildHomepageJsonLd(_skillCount: number) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'Tank',
        url: 'https://tankpkg.dev',
        logo: 'https://tankpkg.dev/logo.png',
        description:
          'Security-first package registry for AI agent skills. Prevent credential exfiltration and supply chain attacks with mandatory security scanning.',
        sameAs: ['https://github.com/tankpkg', 'https://x.com/tankpkg']
      },
      {
        '@type': 'WebSite',
        name: 'Tank',
        url: 'https://tankpkg.dev',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://tankpkg.dev/skills?q={search_term_string}',
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

function JsonLdScript({ data }: { data: ReturnType<typeof buildHomepageJsonLd> }) {
  return <script type="application/ld+json">{JSON.stringify(data)}</script>;
}

export function HomeScreen({ publicSkillCount, starCount }: HomeScreenProps) {
  const jsonLd = useMemo(() => buildHomepageJsonLd(publicSkillCount), [publicSkillCount]);

  return (
    <>
      <JsonLdScript data={jsonLd} />

      {/* 1. Hero — staggered entrance animation */}
      <section className="tank-hero-gradient tank-data-stream relative overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-16 md:pt-24 md:pb-24">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 mb-8">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-400">
                  {publicSkillCount >= 5
                    ? `${publicSkillCount} Security-Verified Skills \u00b7 Open Source`
                    : 'Open Source \u00b7 MIT Licensed'}
                </span>
              </div>
            </motion.div>

            <motion.h1
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}>
              <span className="block">Security-first</span>
              <span className="block text-emerald-400">package manager</span>
              <span className="block mt-2">for AI agent skills</span>
            </motion.h1>

            <motion.p
              className="text-base sm:text-lg text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}>
              Today&apos;s skill registries have no versioning, no lockfiles, no permissions, and no security scanning.{' '}
              <span className="text-foreground font-medium">Tank is the npm for agent skills</span> — with security
              built in from day one.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row gap-3 justify-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}>
              <Button
                size="lg"
                asChild
                className="bg-emerald-600 hover:bg-emerald-500 text-white group"
                data-testid="home-primary-cta">
                <Link to="/skills" search={{} as never}>
                  Browse Skills
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <HomePrimaryAuthCta testId="home-secondary-cta" />
            </motion.div>

            <motion.div
              className="mt-12 flex flex-col items-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}>
              <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
                <p className="text-xs sm:text-sm text-muted-foreground font-mono">
                  <span className="text-emerald-400 select-none">$ </span>
                  <span className="text-slate-300">{INSTALL_COMMAND}</span>
                </p>
                <CopyInstallButton command={INSTALL_COMMAND} />
              </div>
              <a
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-emerald-400 transition-colors">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d={GITHUB_ICON_PATH} clipRule="evenodd" />
                </svg>
                <span>Star on GitHub{starCount !== null ? ` (${starCount})` : ''}</span>
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 2. Stats */}
      {publicSkillCount > 0 && (
        <section className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto flex items-center justify-center gap-8 sm:gap-12 text-center">
            <div>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-2xl font-bold text-foreground">{publicSkillCount}</span>
              </div>
              <span className="text-xs text-muted-foreground">Skills Published</span>
            </div>
            <div className="h-8 w-px bg-emerald-500/20" />
            <div>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-2xl font-bold text-foreground">{publicSkillCount}</span>
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

      {/* 3. Code Example — tank.json */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
              Declare what your agent is <span className="text-emerald-400">allowed to do</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">tank.json</code> is like package.json —
              but with a <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">permissions</code> field. If
              any skill exceeds the budget, installation fails.
            </p>
          </div>

          <div className="tank-terminal tank-scanlines rounded-xl overflow-hidden">
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

      {/* 4. Feature Grid */}
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

      {/* 5. CLI Quick Start */}
      <section className="relative py-16 md:py-24 overflow-hidden">
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
                    <span className="text-slate-200 group-hover:text-white transition-colors">{INSTALL_COMMAND}</span>
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

      {/* 6. Risk Warning — ClawHavoc */}
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

      {/* 7. FAQ */}
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

      {/* 8. CTA */}
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
                <Link to="/skills" search={{} as never}>
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
    </>
  );
}
