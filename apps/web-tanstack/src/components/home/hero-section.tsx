import { Link } from '@tanstack/react-router';
import { ArrowRight, CheckCircle2, Globe, Shield } from 'lucide-react';
import { motion } from 'motion/react';

import { CopyInstallButton } from '~/components/copy-install-button';
import { HomePrimaryAuthCta } from '~/components/home-auth-cta';
import { Button } from '~/components/ui/button';
import { GITHUB_ICON_PATH, INSTALL_COMMAND } from '~/consts/brand';

interface HeroSectionProps {
  publicSkillCount: number;
  starCount: number | null;
}

export function HeroSection({ publicSkillCount, starCount }: HeroSectionProps) {
  return (
    <>
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
    </>
  );
}
