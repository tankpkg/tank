import { Atom } from 'lucide-react';
import { motion } from 'motion/react';

const ATOM_TYPES = [
  { emoji: '📜', kind: 'instruction', desc: 'System prompts & behavioral rules' },
  { emoji: '🪝', kind: 'hook', desc: 'Lifecycle events (pre-file-write, pre-command, ...)' },
  { emoji: '🔧', kind: 'tool', desc: 'MCP tools agents can invoke' },
  { emoji: '🤖', kind: 'agent', desc: 'Autonomous sub-agents with scoped roles' },
  { emoji: '🛡', kind: 'rule', desc: 'Guardrails & constraints that override instructions' },
  { emoji: '📡', kind: 'resource', desc: 'External data sources (APIs, databases, files)' },
  { emoji: '💬', kind: 'prompt', desc: 'Reusable prompt templates with variables' }
];

const PLATFORMS = ['Claude Code', 'Cursor', 'OpenCode', 'Windsurf', 'Cline', 'Roo Code'];

export function AtomsSection() {
  return (
    <section className="relative z-[1] border-t border-border" aria-label="Atoms architecture">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-tank/10 border border-tank/12 mb-4">
            <Atom className="w-5 h-5 text-tank" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            7 primitives. <span className="text-tank">Every platform.</span>
          </h2>
          <p className="text-muted-foreground text-[15px] max-w-lg mx-auto">
            Atoms are the building blocks of AI agent skills. Write once in{' '}
            <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">tank.json</code>, compile to native
            configs for every editor.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          {ATOM_TYPES.map((atom, i) => (
            <motion.div
              key={atom.kind}
              className="rounded border border-border bg-card/30 hover:bg-card/50 transition-colors px-4 py-3"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04, duration: 0.2 }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base" aria-hidden="true">
                  {atom.emoji}
                </span>
                <span className="text-[13px] font-bold tracking-tight font-mono">{atom.kind}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{atom.desc}</p>
            </motion.div>
          ))}

          <motion.div
            className="rounded border border-dashed border-border bg-card/20 px-4 py-3 flex items-center"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.2 }}>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base" aria-hidden="true">
                  📦
                </span>
                <span className="text-[13px] font-bold tracking-tight font-mono">bundle</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Combine 2+ atoms into a single installable skill
              </p>
            </div>
          </motion.div>
        </div>

        <motion.div
          className="tank-terminal tank-scanlines mx-auto max-w-[640px] rounded overflow-hidden"
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border">
            <span className="size-2.5 rounded-full bg-red-500/50" />
            <span className="size-2.5 rounded-full bg-yellow-500/50" />
            <span className="size-2.5 rounded-full bg-tank/50" />
            <span className="ml-2 text-[11px] text-muted-foreground/50 font-mono">cross-platform build</span>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <p className="text-[11px] text-muted-foreground/40 mb-1 font-mono">
                # One command compiles for every editor
              </p>
              <p className="text-sm font-mono">
                <span className="text-tank select-none">$ </span>
                <span className="text-foreground/80">tank build</span>
              </p>
            </div>
            <div className="border-t border-border/50" />
            <div className="space-y-1.5">
              <p className="text-[12px] font-mono text-tank">build</p>
              <p className="text-[12px] font-mono text-muted-foreground/70">
                {'  '}Reading <span className="text-amber-400">tank.json</span> → 3 instructions, 2 hooks, 1 tool
              </p>
              <p className="text-[12px] font-mono text-muted-foreground/70">
                {'  '}
                <span className="text-muted-foreground/40">├</span> .claude/commands/ {'  '}
                <span className="text-tank">✓</span>
              </p>
              <p className="text-[12px] font-mono text-muted-foreground/70">
                {'  '}
                <span className="text-muted-foreground/40">├</span> .cursor/rules/ {'     '}
                <span className="text-tank">✓</span>
              </p>
              <p className="text-[12px] font-mono text-muted-foreground/70">
                {'  '}
                <span className="text-muted-foreground/40">├</span> .opencode/ {'         '}
                <span className="text-tank">✓</span>
              </p>
              <p className="text-[12px] font-mono text-muted-foreground/70">
                {'  '}
                <span className="text-muted-foreground/40">├</span> .windsurf/rules/ {'  '}
                <span className="text-tank">✓</span>
              </p>
              <p className="text-[12px] font-mono text-muted-foreground/70">
                {'  '}
                <span className="text-muted-foreground/40">└</span> .clinerules/ {'      '}
                <span className="text-tank">✓</span>
              </p>
            </div>
            <div className="border-t border-border/50" />
            <p className="text-[12px] font-mono text-tank">
              compiled <span className="text-amber-400">6 atoms</span> for{' '}
              <span className="text-amber-400">5 platforms</span>
            </p>
          </div>
        </motion.div>

        <motion.div
          className="flex flex-wrap justify-center gap-2 mt-8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.3 }}>
          {PLATFORMS.map((platform) => (
            <span
              key={platform}
              className="inline-flex items-center rounded-full border border-border bg-card/30 px-3 py-1 text-[12px] font-medium text-muted-foreground">
              {platform}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
