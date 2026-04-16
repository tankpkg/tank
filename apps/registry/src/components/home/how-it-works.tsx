import { motion } from 'motion/react';

const STEPS = [
  {
    number: '1',
    title: 'Publish with scanning',
    description: 'Every package passes through a 6-stage security pipeline before it reaches the registry.',
    stages: [
      'Ingestion & hashing',
      'Structure validation',
      'Static analysis (Semgrep + Bandit)',
      'Injection detection',
      'Secrets scanning (detect-secrets)',
      'Dependency audit (OSV)'
    ]
  },
  {
    number: '2',
    title: 'Install with integrity',
    description:
      'Every package is pinned with SHA-512 hashes in a lockfile. If the content changes after install, the next verify fails.',
    stages: [
      'SHA-512 integrity hashing',
      'Lockfile pinning (tank.lock)',
      'Tamper detection on verify',
      'Install from URL — scanned first'
    ]
  },
  {
    number: '3',
    title: 'Run with permissions',
    description:
      'Declare what your agent can do. Packages exceeding the permission budget are rejected before they run.',
    stages: [
      'Network outbound allowlists',
      'Filesystem read/write scopes',
      'Subprocess enable/disable',
      'Escalation detection on update'
    ]
  }
];

export function HowItWorks() {
  return (
    <section className="relative z-[1]" aria-label="How Tank works">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">How Tank Works</h2>
          <p className="text-muted-foreground text-[15px]">Three steps from publish to verified.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              className="step-card rounded border border-border bg-card/30 p-6"
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.25 }}>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-tank/10 border border-tank/12 text-tank text-xs font-bold font-mono mb-4">
                {step.number}
              </span>
              <h3 className="text-[15px] font-bold tracking-tight mb-2">{step.title}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">{step.description}</p>
              <ul className="space-y-1.5">
                {step.stages.map((stage) => (
                  <li key={stage} className="flex items-start gap-2 text-[12px] text-muted-foreground/70">
                    <span className="text-tank mt-0.5 text-[10px]">▸</span>
                    <span>{stage}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
