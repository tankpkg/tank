import { Link } from '@tanstack/react-router';
import { ArrowRight, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';

import { HeroSection } from '~/components/home/hero-section';
import { HowItWorks } from '~/components/home/how-it-works';
import { WhyTankExists } from '~/components/home/why-tank-exists';
import { WorksWith } from '~/components/home/works-with';
import { Button } from '~/components/ui/button';
import { GITHUB_ICON_PATH } from '~/consts/brand';
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

      <HeroSection starCount={starCount} />

      <WorksWith />

      <WhyTankExists />

      <HowItWorks />

      <TankJsonExample />

      <ContributorsSection />

      <BottomCta starCount={starCount} />
    </>
  );
}

function TankJsonExample() {
  return (
    <section className="relative z-[1] border-t border-border" aria-label="tank.json example">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            Declare what your agent is <span className="text-tank">allowed to do</span>
          </h2>
          <p className="text-muted-foreground text-[15px]">
            <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">tank.json</code> is like package.json —
            but with permissions.
          </p>
        </motion.div>

        <motion.div
          className="tank-terminal tank-scanlines mx-auto max-w-[600px] rounded overflow-hidden"
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border">
            <span className="size-2.5 rounded-full bg-red-500/50" />
            <span className="size-2.5 rounded-full bg-yellow-500/50" />
            <span className="size-2.5 rounded-full bg-tank/50" />
            <span className="ml-2 text-[11px] text-muted-foreground/50 font-mono">tank.json</span>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="verified-dot" />
              <span className="text-[11px] text-tank font-mono">verified</span>
            </span>
          </div>

          <pre className="p-5 text-[13px] leading-[1.75] overflow-x-auto font-mono">
            <code>
              <span className="text-muted-foreground/30">{'{'}</span>
              {'\n'}
              {'  '}
              <span className="text-tank">"skills"</span>
              <span className="text-muted-foreground/30">: {'{'}</span>
              {'\n'}
              {'    '}
              <span className="text-tank">"@vercel/next-skill"</span>
              <span className="text-muted-foreground/30">:</span> <span className="text-amber-400">"^2.1.0"</span>
              <span className="text-muted-foreground/30">,</span>
              {'\n'}
              {'    '}
              <span className="text-tank">"@community/seo-audit"</span>
              <span className="text-muted-foreground/30">:</span> <span className="text-amber-400">"3.0.0"</span>
              {'\n'}
              {'  '}
              <span className="text-muted-foreground/30">{'},'}</span>
              {'\n'}
              {'  '}
              <span className="text-tank">"permissions"</span>
              <span className="text-muted-foreground/30">: {'{'}</span>
              {'\n'}
              {'    '}
              <span className="text-tank">"network"</span>
              <span className="text-muted-foreground/30">: {'{'}</span>
              {'\n'}
              {'      '}
              <span className="text-tank">"outbound"</span>
              <span className="text-muted-foreground/30">:</span>{' '}
              <span className="text-amber-400">["*.anthropic.com"]</span>
              {'\n'}
              {'    '}
              <span className="text-muted-foreground/30">{'},'}</span>
              {'\n'}
              {'    '}
              <span className="text-tank">"filesystem"</span>
              <span className="text-muted-foreground/30">: {'{'}</span>
              {'\n'}
              {'      '}
              <span className="text-tank">"read"</span>
              <span className="text-muted-foreground/30">:</span> <span className="text-amber-400">["./src/**"]</span>
              <span className="text-muted-foreground/30">,</span>
              {'\n'}
              {'      '}
              <span className="text-tank">"write"</span>
              <span className="text-muted-foreground/30">:</span>{' '}
              <span className="text-amber-400">["./output/**"]</span>
              {'\n'}
              {'    '}
              <span className="text-muted-foreground/30">{'},'}</span>
              {'\n'}
              {'    '}
              <span className="text-tank">"subprocess"</span>
              <span className="text-muted-foreground/30">:</span> <span className="text-pink-400">false</span>
              {'\n'}
              {'  '}
              <span className="text-muted-foreground/30">{'}'}</span>
              {'\n'}
              <span className="text-muted-foreground/30">{'}'}</span>
            </code>
          </pre>
        </motion.div>
      </div>
    </section>
  );
}

function ContributorsSection() {
  return (
    <section className="relative z-[1] border-t border-border" aria-label="Contributors">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-tank/10 border border-tank/12 mb-4">
            <Users className="w-5 h-5 text-tank" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-2">Built by the community</h2>
          <p className="text-muted-foreground text-[15px] mb-8">Thank you to everyone who has contributed.</p>
        </motion.div>

        <div className="mb-6">
          <div
            role="img"
            aria-label="Tank contributors"
            className="mx-auto max-w-sm w-full rounded aspect-[2/1] bg-center bg-contain bg-no-repeat"
            style={{ backgroundImage: 'url("https://contrib.rocks/image?repo=tankpkg/tank")' }}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
          <Button variant="outline" size="sm" asChild>
            <a href="https://github.com/tankpkg/tank/graphs/contributors" target="_blank" rel="noopener noreferrer">
              View all contributors
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/docs/$" params={{ _splat: '' }}>
              Become a contributor
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function BottomCta({ starCount }: { starCount: number | null }) {
  return (
    <section className="relative z-[1] border-t border-border overflow-hidden" aria-label="Call to action">
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px]"
        style={{ background: 'radial-gradient(ellipse, rgba(0,255,65,0.04) 0%, transparent 60%)' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20 text-center">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            Ready to secure your <span className="text-tank">agent skills?</span>
          </h2>
          <p className="text-muted-foreground text-[15px] mb-8">
            Tank is open source and free. Install with confidence.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" asChild className="group">
              <Link to="/skills" search={{} as never}>
                Browse Skills
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="https://github.com/tankpkg/tank" target="_blank" rel="noopener noreferrer">
                <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d={GITHUB_ICON_PATH} clipRule="evenodd" />
                </svg>
                Star on GitHub{starCount !== null ? ` (${starCount})` : ''}
              </a>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
