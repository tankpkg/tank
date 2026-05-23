import { Link } from '@tanstack/react-router';
import { ArrowRight, Lock, Scan, Shield, Vault } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback } from 'react';

import { InstallSelector } from '~/components/home/install-selector';
import { Button } from '~/components/ui/button';
import { GITHUB_ICON_PATH } from '~/consts/brand';

const spring = { type: 'spring' as const, stiffness: 400, damping: 30 };
const controlBars = ['left', 'center', 'right'] as const;

const DIFFERENTIATOR_PILLS = [
  { label: '6-Stage Scanning', icon: Scan, href: '#how-it-works' },
  { label: 'Credential Vault', icon: Vault, href: '#vault' },
  { label: 'Permission Budgets', icon: Shield, href: '#why-tank' },
  { label: 'SHA-512 Integrity', icon: Lock, href: '#features' }
];

interface HeroSectionProps {
  starCount: number | null;
  publicSkillCount?: number;
  selfhostedAppUrl?: string;
}

export function HeroSection({ starCount, publicSkillCount, selfhostedAppUrl }: HeroSectionProps) {
  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return;
    el.playbackRate = 0.9;
  }, []);

  return (
    <section className="relative z-[1] pt-20 pb-12 md:pt-28 md:pb-16" aria-label="Hero">
      {/* Subtle radial glow behind hero — shifted left to account for wider layout */}
      <div
        className="pointer-events-none absolute -top-40 left-1/3 -translate-x-1/2 w-[700px] h-[500px]"
        style={{ background: 'radial-gradient(circle, rgba(0,255,65,0.06) 0%, transparent 55%)' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-12">
          {/* Left — text content */}
          <div className="flex flex-col flex-1 min-w-0 text-center lg:text-left">
            {/* Badge */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm border border-tank/15 bg-tank/5 text-xs font-medium text-tank">
                <Shield className="w-3 h-3" />
                Open Source · MIT Licensed
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              className="mt-7 text-4xl sm:text-5xl lg:text-6xl font-display font-bold tracking-[-0.04em] leading-[1.08]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.05 }}>
              The Package Manager
              <br />
              <span className="text-tank glow-text">for AI Agents</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              className="mt-5 text-muted-foreground text-base sm:text-[17px] leading-relaxed max-w-[560px] lg:mx-0 mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.1 }}>
              Install from registries or any URL — every package scanned through a 6-stage security pipeline. Permission
              budgets, SHA-512 lockfiles, and escalation detection. What npm did for JavaScript, Tank does for AI
              agents.
            </motion.p>

            {/* Differentiator pills — scannable value props */}
            <motion.div
              className="mt-5 flex flex-wrap items-center justify-center lg:justify-start gap-2"
              data-testid="hero-differentiator-pills"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.12 }}>
              {DIFFERENTIATOR_PILLS.map((pill) => (
                <a
                  key={pill.label}
                  href={pill.href}
                  data-testid="hero-differentiator-pill"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card/50 hover:bg-card hover:border-tank/30 transition-colors text-[12px] font-medium text-muted-foreground hover:text-foreground no-underline">
                  <pill.icon className="w-3 h-3 text-tank" />
                  {pill.label}
                </a>
              ))}
            </motion.div>

            {/* Stats row — social proof. Hidden entirely on an empty registry to avoid a "ghost town" impression. */}
            {((publicSkillCount && publicSkillCount > 0) || (starCount && starCount > 0)) && (
              <motion.div
                className="mt-3 flex items-center justify-center lg:justify-start gap-4 text-[13px] text-muted-foreground/50"
                data-testid="hero-stats"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.14 }}>
                {publicSkillCount !== undefined && publicSkillCount > 0 && (
                  <>
                    <span>
                      <span className="text-foreground/80 font-semibold">{publicSkillCount.toLocaleString()}</span>{' '}
                      packages scanned
                    </span>
                    <span className="text-border">·</span>
                  </>
                )}
                {starCount !== null && starCount > 0 && (
                  <>
                    <span>
                      <span className="text-foreground/80 font-semibold">{starCount.toLocaleString()}</span> GitHub
                      stars
                    </span>
                    <span className="text-border">·</span>
                  </>
                )}
                <span>MIT Licensed</span>
              </motion.div>
            )}

            {/* Install method selector — biggest CTA */}
            <motion.div
              className="mt-6 max-w-[560px] lg:mx-0 mx-auto w-full"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...spring, delay: 0.15 }}>
              <InstallSelector appUrl={selfhostedAppUrl} />
            </motion.div>

            {/* CTAs — proper Buttons instead of tiny text links */}
            <motion.div
              className="mt-4 flex items-center justify-center lg:justify-start gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.2 }}>
              <Button size="lg" asChild data-testid="home-primary-cta">
                <Link to="/skills" search={{} as never}>
                  Browse Packages
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" data-testid="home-secondary-cta" asChild>
                <Link to="/docs/$" params={{ _splat: '' }}>
                  View Docs
                </Link>
              </Button>
              <a
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d={GITHUB_ICON_PATH} clipRule="evenodd" />
                </svg>
                Star{starCount !== null ? ` ${starCount}` : ''}
              </a>
            </motion.div>
          </div>

          <motion.div
            className="hidden lg:flex flex-shrink-0 items-end justify-center relative w-[420px] xl:w-[480px]"
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ ...spring, delay: 0.25 }}>
            <div className="relative w-full">
              <div className="relative" style={{ perspective: '800px' }}>
                {/* CRT outer shell */}
                <div
                  className="relative rounded-[12px] p-[14px] pb-0 bg-[#1c1c1e] dark:bg-[#e8e5e0]"
                  style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.5)' }}>
                  {/* Inner bezel */}
                  <div
                    className="rounded-[6px] p-[6px] bg-[#111113] dark:bg-[#ccc8c0]"
                    style={{ boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3), inset 0 0 2px rgba(0,0,0,0.2)' }}>
                    {/* Screen */}
                    <div className="relative overflow-hidden bg-black aspect-[4/3]" style={{ borderRadius: '8% / 2%' }}>
                      <video
                        ref={videoRef}
                        src="/tank-operator.webm"
                        autoPlay
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-contain"
                      />
                      {/* Scanlines — animated */}
                      <div
                        className="hero-crt-scanlines absolute inset-0 pointer-events-none z-10 opacity-[0.035]"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.8) 1px, rgba(0,0,0,0.8) 2px)',
                          backgroundSize: '100% 3px'
                        }}
                        aria-hidden="true"
                      />
                      {/* RGB pixel grid */}
                      <div
                        className="absolute inset-0 pointer-events-none z-10 opacity-[0.03]"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(90deg, rgba(255,0,0,0.6) 0px, rgba(0,255,0,0.6) 1px, rgba(0,100,255,0.6) 2px, transparent 3px)',
                          backgroundSize: '3px 100%'
                        }}
                        aria-hidden="true"
                      />

                      {/* Vignette — heavy CRT barrel */}
                      <div
                        className="absolute inset-0 pointer-events-none z-10"
                        style={{ boxShadow: 'inset 0 0 80px rgba(0,0,0,0.6), inset 0 0 160px rgba(0,0,0,0.3)' }}
                        aria-hidden="true"
                      />
                      {/* Glass reflection */}
                      <div
                        className="absolute inset-0 pointer-events-none z-10 opacity-[0.05]"
                        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.5) 0%, transparent 35%)' }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  {/* Bottom panel */}
                  <div className="flex items-center justify-between px-3 py-[10px]">
                    <div className="flex items-center gap-[6px]">
                      <div className="w-[6px] h-[6px] rounded-full bg-[#00ff41] shadow-[0_0_4px_rgba(0,255,65,0.6)]" />
                      <span className="text-[8px] font-mono text-[#555] dark:text-[#888] tracking-widest uppercase">
                        Tank
                      </span>
                    </div>
                    <div className="flex gap-[6px]">
                      {controlBars.map((bar) => (
                        <div key={bar} className="w-[14px] h-[3px] rounded-full bg-[#2a2a2c] dark:bg-[#b8b4ae]" />
                      ))}
                    </div>
                  </div>
                </div>
                {/* Stand */}
                <div
                  className="mx-auto w-[45%] h-[8px] bg-[#1c1c1e] dark:bg-[#e8e5e0] rounded-b-md"
                  style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
                  aria-hidden="true"
                />
                <div
                  className="mx-auto w-[65%] h-[5px] bg-[#18181a] dark:bg-[#d5d0c9] rounded-b-lg mt-[-1px]"
                  style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.3)' }}
                  aria-hidden="true"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
