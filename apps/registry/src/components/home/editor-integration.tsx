import { Blocks } from 'lucide-react';
import { motion } from 'motion/react';

const CAPABILITIES = [
  { label: 'Install & update', desc: 'Install, update, and remove packages without leaving your editor' },
  { label: 'Search & discover', desc: 'Search the registry and view package details inline' },
  { label: 'Security scanning', desc: 'Scan packages and view audit results directly' },
  { label: 'Publish', desc: 'Pack, scan, and publish — all from your IDE' },
  { label: 'Permissions & verify', desc: 'Check permission budgets and verify lockfile integrity' },
  { label: 'Diagnostics', desc: 'Run tank doctor to troubleshoot your setup' }
];

const EDITORS = ['Claude Code', 'Cursor', 'VS Code Copilot', 'OpenCode', 'Windsurf', 'Cline', 'Roo Code'];

export function EditorIntegration() {
  return (
    <section className="relative z-[1] border-t border-border" aria-label="Editor integration">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-tank/10 border border-tank/12 mb-4">
            <Blocks className="w-5 h-5 text-tank" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            Native in your <span className="text-tank">editor</span>
          </h2>
          <p className="text-muted-foreground text-[15px] max-w-lg mx-auto">
            The Tank MCP server gives your AI agent 17 tools — full CLI parity, right inside your IDE. No terminal
            needed.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Left — capabilities */}
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, x: -15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3 }}>
            {CAPABILITIES.map((cap, i) => (
              <motion.div
                key={cap.label}
                className="rounded border border-border bg-card/30 px-4 py-3"
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.2 }}>
                <p className="text-[13px] font-semibold tracking-tight mb-0.5">{cap.label}</p>
                <p className="text-[12px] text-muted-foreground">{cap.desc}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Right — terminal-style MCP config */}
          <motion.div
            className="tank-terminal tank-scanlines rounded overflow-hidden"
            initial={{ opacity: 0, x: 15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: 0.1 }}>
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border">
              <span className="size-2.5 rounded-full bg-red-500/50" />
              <span className="size-2.5 rounded-full bg-yellow-500/50" />
              <span className="size-2.5 rounded-full bg-tank/50" />
              <span className="ml-2 text-[11px] text-muted-foreground/50 font-mono">mcp config</span>
            </div>
            <pre className="p-5 text-[12px] leading-[1.8] overflow-x-auto font-mono">
              <code>
                <span className="text-muted-foreground/40">{'{'}</span>
                {'\n'}
                {'  '}
                <span className="text-tank">"mcpServers"</span>
                <span className="text-muted-foreground/40">: {'{'}</span>
                {'\n'}
                {'    '}
                <span className="text-tank">"tank"</span>
                <span className="text-muted-foreground/40">: {'{'}</span>
                {'\n'}
                {'      '}
                <span className="text-tank">"command"</span>
                <span className="text-muted-foreground/40">:</span> <span className="text-amber-400">"npx"</span>
                <span className="text-muted-foreground/40">,</span>
                {'\n'}
                {'      '}
                <span className="text-tank">"args"</span>
                <span className="text-muted-foreground/40">:</span>{' '}
                <span className="text-amber-400">["@tankpkg/mcp-server"]</span>
                {'\n'}
                {'    '}
                <span className="text-muted-foreground/40">{'}'}</span>
                {'\n'}
                {'  '}
                <span className="text-muted-foreground/40">{'}'}</span>
                {'\n'}
                <span className="text-muted-foreground/40">{'}'}</span>
              </code>
            </pre>
            <div className="px-5 pb-4">
              <p className="text-[11px] text-muted-foreground/40 font-mono"># Works with: {EDITORS.join(' · ')}</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
