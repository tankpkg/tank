import { Terminal } from 'lucide-react';

import { INSTALL_COMMAND } from '~/consts/brand';
import { cliCommands } from '~/consts/homepage';

export function CliPreview() {
  return (
    <section className="relative py-16 md:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-emerald-500/5 to-transparent" />

      <div className="container mx-auto px-4 relative">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <Terminal className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
              Get started in <span className="text-emerald-400">seconds</span>
            </h2>
            <p className="text-muted-foreground">Everything you need, right from the terminal.</p>
          </div>

          <div className="tank-terminal tank-scanlines rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-500/20 bg-tank-midnight">
              <span className="size-3 rounded-full bg-red-500/80" />
              <span className="size-3 rounded-full bg-amber-500/80" />
              <span className="size-3 rounded-full bg-emerald-500/80" />
              <span className="ml-3 text-xs text-emerald-400/60 font-mono">tank-cli</span>
            </div>

            <div className="p-4 md:p-6 space-y-4">
              <div className="group">
                <p className="text-xs text-slate-500 mb-1 font-mono"># Install Tank CLI</p>
                <p className="text-sm md:text-base font-mono flex items-center gap-2">
                  <span className="text-emerald-400 select-none">$</span>
                  <span className="text-slate-200 group-hover:text-white transition-colors">{INSTALL_COMMAND}</span>
                </p>
              </div>
              <div className="border-t border-emerald-500/10" />
              {cliCommands.map((item) => (
                <div key={item.cmd} className="group">
                  <p className="text-xs text-slate-500 mb-1 font-mono"># {item.desc}</p>
                  <p className="text-sm md:text-base font-mono flex items-center gap-2">
                    <span className="text-emerald-400 select-none">$</span>
                    <span className="text-slate-200 group-hover:text-white transition-colors">{item.cmd}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
