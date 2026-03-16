import { Link } from '@tanstack/react-router';
import { Shield } from 'lucide-react';
import { motion } from 'motion/react';

import { InstallSelector } from '~/components/home/install-selector';
import { GITHUB_ICON_PATH } from '~/consts/brand';

const spring = { type: 'spring' as const, stiffness: 400, damping: 30 };

interface HeroSectionProps {
  starCount: number | null;
}

export function HeroSection({ starCount }: HeroSectionProps) {
  return (
    <section className="relative z-[1] pt-20 pb-12 md:pt-28 md:pb-16" aria-label="Hero">
      {/* Subtle radial glow behind hero */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px]"
        style={{ background: 'radial-gradient(circle, rgba(0,255,65,0.06) 0%, transparent 55%)' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-[800px] px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm border border-tank/15 bg-tank/5 text-xs font-medium text-tank">
            <Shield className="w-3 h-3" />
            Open Source · MIT Licensed
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          className="mt-7 text-4xl sm:text-5xl md:text-6xl font-display font-bold tracking-[-0.04em] leading-[1.08]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.05 }}>
          The Package Manager
          <br />
          <span className="text-tank glow-text">for AI Agent Skills</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="mt-5 text-muted-foreground text-base sm:text-[17px] leading-relaxed max-w-[560px] mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.1 }}>
          Integrity verification, permission budgets, and 6-stage security scanning. What npm did for JavaScript, Tank
          does for agent skills.
        </motion.p>

        {/* Install method selector — biggest CTA */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring, delay: 0.15 }}>
          <InstallSelector />
        </motion.div>

        {/* Secondary links */}
        <motion.div
          className="mt-6 flex items-center justify-center gap-4 text-[13px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.2 }}>
          <Link to="/docs" className="text-muted-foreground/60 hover:text-foreground transition-colors">
            View Docs
          </Link>
          <span className="text-muted-foreground/20">·</span>
          <Link
            to="/skills"
            search={{} as never}
            className="text-muted-foreground/60 hover:text-foreground transition-colors">
            Browse Skills
          </Link>
          <span className="text-muted-foreground/20">·</span>
          <a
            href="https://github.com/tankpkg/tank"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-muted-foreground/60 hover:text-foreground transition-colors">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" d={GITHUB_ICON_PATH} clipRule="evenodd" />
            </svg>
            Star on GitHub{starCount !== null ? ` (${starCount})` : ''}
          </a>
        </motion.div>
      </div>
    </section>
  );
}
