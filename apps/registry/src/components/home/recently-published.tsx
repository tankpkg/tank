import { encodeSkillName } from '@internals/helpers';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

import type { RecentSkill } from '~/query/skills';

interface RecentlyPublishedProps {
  skills: RecentSkill[];
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}

export function RecentlyPublished({ skills }: RecentlyPublishedProps) {
  if (skills.length === 0) return null;

  return (
    <section
      id="recently-published"
      data-testid="recently-published"
      className="relative z-[1] border-t border-border"
      aria-label="Recently published packages">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <p className="text-[11px] font-semibold uppercase tracking-[2px] text-tank mb-3">Fresh</p>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">Recently published</h2>
          <p className="text-muted-foreground text-[15px]">The newest verified packages on Tank.</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.map((skill, i) => (
            <motion.div
              key={skill.name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04, duration: 0.2 }}>
              <Link
                to="/skills/$"
                params={{ _splat: encodeSkillName(skill.name) }}
                data-testid="recent-skill-card"
                className="block rounded-lg border border-border bg-card/30 hover:bg-card/60 hover:border-tank/30 transition-colors p-4 no-underline h-full">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-mono text-[13px] font-semibold text-foreground truncate">{skill.name}</p>
                  {skill.scanVerdict === 'pass' && (
                    <ShieldCheck className="size-3.5 text-tank shrink-0 mt-0.5" aria-label="Verified" />
                  )}
                </div>
                {skill.description && (
                  <p className="text-[12px] text-muted-foreground line-clamp-2 mb-2">{skill.description}</p>
                )}
                <p className="text-[11px] text-muted-foreground/60">
                  by {skill.publisher} · {timeAgo(skill.publishedAt)}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/skills"
            search={{} as never}
            className="inline-flex items-center gap-1.5 text-sm text-tank hover:underline font-medium">
            Browse all packages
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
