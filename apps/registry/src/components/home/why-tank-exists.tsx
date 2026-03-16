import { motion } from 'motion/react';

const PROBLEMS = [
  {
    title: 'No versioning',
    description:
      'Skills update silently. No lockfiles, no pinning, no rollback. What you installed yesterday might be different today.'
  },
  {
    title: 'No permissions',
    description:
      "Every skill runs with the agent's full access — files, API keys, shell commands. No sandboxing, no boundaries."
  },
  {
    title: 'No scanning',
    description:
      '341 malicious skills (12% of a major marketplace) went undetected. ClawHavoc shipped credential-stealing malware.'
  }
];

const SOLUTIONS = [
  {
    title: 'Locked versions + integrity',
    description:
      'SHA-512 hashes pin every skill. Tampered content fails on install. Enforced semver with permission escalation detection.'
  },
  {
    title: 'Permission budgets',
    description:
      'Declare network, filesystem, and subprocess limits. Skills that exceed the budget are rejected before they run.'
  },
  {
    title: '6-stage security pipeline',
    description:
      'Every skill is scanned at publish time: ingestion, validation, static analysis, injection detection, secrets scanning, dependency audit.'
  }
];

export function WhyTankExists() {
  return (
    <section className="relative z-[1] border-b border-border" aria-label="Why Tank exists">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">Why Tank Exists</h2>
          <p className="text-muted-foreground text-[15px]">Agent skills today have zero security infrastructure.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Problems */}
          <motion.div
            className="rounded border border-red-500/15 bg-red-500/[0.02] p-6 sm:p-7"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
            <p className="text-[11px] font-semibold uppercase tracking-[2px] text-red-500 mb-5">Today&apos;s Reality</p>
            <div className="space-y-4">
              {PROBLEMS.map((p) => (
                <div key={p.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] bg-red-500/10 text-red-500">
                    ✕
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold mb-1">{p.title}</h4>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">{p.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Solutions */}
          <motion.div
            className="rounded border border-tank/15 bg-tank/[0.02] p-6 sm:p-7"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
            <p className="text-[11px] font-semibold uppercase tracking-[2px] text-tank mb-5">With Tank</p>
            <div className="space-y-4">
              {SOLUTIONS.map((s) => (
                <div key={s.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-[11px] bg-tank/10 text-tank">
                    ✓
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold mb-1">{s.title}</h4>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Self-hosting callout */}
            <div className="mt-5 pt-5 border-t border-tank/10">
              <div className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] bg-tank/10 text-tank">
                  ✓
                </span>
                <div>
                  <h4 className="text-sm font-semibold mb-1">Self-host for your organization</h4>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    Run your own registry internally. Keep skills in your network with the same security guarantees.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
