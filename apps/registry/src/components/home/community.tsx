import { Bell, GitFork, Github, MessageCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface CommunityProps {
  starCount: number | null;
  discordInviteUrl?: string;
}

export function Community({ starCount, discordInviteUrl }: CommunityProps) {
  return (
    <section
      id="community"
      data-testid="community"
      className="relative z-[1] border-t border-border"
      aria-label="Community">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <p className="text-[11px] font-semibold uppercase tracking-[2px] text-tank mb-3">Community</p>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">Stay in the loop</h2>
          <p className="text-muted-foreground text-[15px]">
            Tank is open source. Follow along, ask questions, ship improvements.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CommunityCard
            icon={Github}
            href="https://github.com/tankpkg/tank"
            label="Star on GitHub"
            sub={starCount ? `${starCount.toLocaleString()} stars` : 'Show support'}
          />
          <CommunityCard
            icon={Bell}
            href="https://github.com/tankpkg/tank/releases"
            label="Watch releases"
            sub="Subscribe to new versions"
          />
          <CommunityCard
            icon={MessageCircle}
            href="https://github.com/tankpkg/tank/discussions"
            label="Discussions"
            sub="Ask questions, share ideas"
          />
          {discordInviteUrl ? (
            <CommunityCard icon={MessageCircle} href={discordInviteUrl} label="Discord" sub="Chat in real time" />
          ) : (
            <CommunityCard
              icon={GitFork}
              href="https://github.com/tankpkg/tank/blob/main/CONTRIBUTING.md"
              label="Contribute"
              sub="Help build Tank"
            />
          )}
        </div>
      </div>
    </section>
  );
}

interface CommunityCardProps {
  icon: typeof Github;
  href: string;
  label: string;
  sub: string;
}

function CommunityCard({ icon: Icon, href, label, sub }: CommunityCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="community-card"
      className="group rounded-lg border border-border bg-card/30 hover:bg-card/60 hover:border-tank/30 transition-colors p-4 no-underline flex flex-col gap-2">
      <Icon className="size-5 text-tank" />
      <p className="font-medium text-sm group-hover:text-foreground transition-colors">{label}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </a>
  );
}
