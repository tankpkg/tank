import { motion } from 'motion/react';

const TOOLS = [
  { name: 'Claude Code', icon: '✦' },
  { name: 'Cursor', icon: '⊞' },
  { name: 'GitHub Copilot', icon: '◆' },
  { name: 'Codex', icon: '▸' },
  { name: 'Windsurf', icon: '◇' }
];

export function WorksWith() {
  return (
    <section className="relative z-[1] border-y border-border py-10" aria-label="Compatible AI coding tools">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[3px] text-muted-foreground/40 mb-6">Works with</p>
        <div className="flex flex-wrap justify-center gap-8 sm:gap-10">
          {TOOLS.map((tool, i) => (
            <motion.div
              key={tool.name}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.2 }}
              className="flex items-center gap-2.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors duration-200">
              <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-muted/30 border border-border text-sm">
                {tool.icon}
              </span>
              <span className="text-sm font-semibold tracking-tight">{tool.name}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
