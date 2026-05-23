import { ArrowUpRight, ScanLine, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

interface Product {
  name: string;
  href: string;
  tagline: string;
  use: string;
  icon: typeof ScanLine;
  faviconUrl: string;
}

const PRODUCTS: Product[] = [
  {
    name: 'prompt2bot',
    href: 'https://prompt2bot.com',
    tagline: 'Turn a single prompt into a working AI agent.',
    use: 'Uses the Tank SDK to load and verify skills dynamically at runtime.',
    icon: Sparkles,
    faviconUrl: 'https://www.google.com/s2/favicons?domain=prompt2bot.com&sz=64'
  },
  {
    name: 'Skills-IL',
    href: 'https://agentskills.co.il',
    tagline: 'Hebrew-language skills marketplace for AI agents.',
    use: 'Uses Tank as the security scanner for every published skill.',
    icon: ScanLine,
    faviconUrl: 'https://www.google.com/s2/favicons?domain=agentskills.co.il&sz=64'
  }
];

export function BuiltWithTank() {
  return (
    <section
      id="built-with"
      data-testid="built-with-tank"
      className="relative z-[1] border-t border-border"
      aria-label="Built with Tank">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <p className="text-[11px] font-semibold uppercase tracking-[2px] text-tank mb-3">In Production</p>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            Built with <span className="text-tank">Tank</span>
          </h2>
          <p className="text-muted-foreground text-[15px] max-w-lg mx-auto">
            Real products use Tank to package, scan, and load AI agent skills in production.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PRODUCTS.map((product, i) => (
            <motion.a
              key={product.name}
              href={product.href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="built-with-card"
              className="group rounded-lg border border-border bg-card/30 hover:bg-card/60 hover:border-tank/30 transition-colors p-6 flex flex-col gap-3 no-underline"
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.25 }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-none size-9 rounded-md overflow-hidden border border-border bg-background">
                    <img
                      src={product.faviconUrl}
                      alt=""
                      aria-hidden="true"
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-lg font-semibold tracking-tight truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{product.tagline}</p>
                  </div>
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-tank transition-colors shrink-0 mt-1" />
              </div>

              <div className="flex items-start gap-2 pt-3 border-t border-border/50">
                <product.icon className="size-3.5 text-tank shrink-0 mt-0.5" />
                <p className="text-[13px] text-muted-foreground leading-relaxed">{product.use}</p>
              </div>
            </motion.a>
          ))}
        </div>

        <motion.p
          className="text-center text-[12px] text-muted-foreground/60 mt-8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.3 }}>
          Building something with Tank?{' '}
          <a
            href="https://github.com/tankpkg/tank/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-tank hover:underline">
            Tell us
          </a>{' '}
          and we'll feature you here.
        </motion.p>
      </div>
    </section>
  );
}
