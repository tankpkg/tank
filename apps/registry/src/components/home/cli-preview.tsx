import { Terminal } from 'lucide-react';
import { motion } from 'motion/react';

import { INSTALL_COMMAND } from '~/consts/brand';
import { cliCommands } from '~/consts/homepage';

export function CliPreview() {
  return (
    <section className="relative z-[1] border-t border-border" aria-label="CLI preview">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-tank/10 border border-tank/12 mb-4">
            <Terminal className="w-5 h-5 text-tank" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            Get started in <span className="text-tank">seconds</span>
          </h2>
          <p className="text-muted-foreground text-[15px]">Everything you need, right from the terminal.</p>
        </motion.div>

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
            <span className="ml-2 text-[11px] text-muted-foreground/50 font-mono">tank-cli</span>
          </div>

          <div className="p-5 space-y-4">
            <div className="group">
              <p className="text-[11px] text-muted-foreground/40 mb-1 font-mono"># Install Tank CLI</p>
              <p className="text-sm font-mono flex items-center gap-2">
                <span className="text-tank select-none">$</span>
                <span className="text-foreground/80 group-hover:text-foreground transition-colors">
                  {INSTALL_COMMAND}
                </span>
              </p>
            </div>
            <div className="border-t border-border/50" />
            {cliCommands.map((item) => (
              <div key={item.cmd} className="group">
                <p className="text-[11px] text-muted-foreground/40 mb-1 font-mono"># {item.desc}</p>
                <p className="text-sm font-mono flex items-center gap-2">
                  <span className="text-tank select-none">$</span>
                  <span className="text-foreground/80 group-hover:text-foreground transition-colors">{item.cmd}</span>
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
