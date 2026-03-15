import { Link } from '@tanstack/react-router';
import { ArrowRight, Shield, Star } from 'lucide-react';
import { useMemo } from 'react';

import { CliPreview } from '~/components/home/cli-preview';
import { FaqSection } from '~/components/home/faq-section';
import { FeaturesGrid } from '~/components/home/features-grid';
import { HeroSection } from '~/components/home/hero-section';
import { Button } from '~/components/ui/button';
import { faqItems } from '~/consts/homepage';

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

      <HeroSection publicSkillCount={publicSkillCount} starCount={starCount} />

      <TankJsonExample />

      <FeaturesGrid />

      <CliPreview />

      <RiskWarning />

      <FaqSection />

      <BottomCta starCount={starCount} />
    </>
  );
}

function TankJsonExample() {
  return (
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
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-500/20 bg-tank-midnight">
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
  );
}

function RiskWarning() {
  return (
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
  );
}

function BottomCta({ starCount }: { starCount: number | null }) {
  return (
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
  );
}
