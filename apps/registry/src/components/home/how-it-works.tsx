import { motion } from 'motion/react';

const STEPS = [
  {
    number: '1',
    title: 'Publish with scanning',
    description:
      'Every skill passes through a 6-stage security pipeline. Malware, secrets, and permission escalation are caught at publish time.'
  },
  {
    number: '2',
    title: 'Install with integrity',
    description:
      'Every skill is pinned with SHA-512 hashes. If the content changes after install, the next install fails. No silent tampering.'
  },
  {
    number: '3',
    title: 'Run with permissions',
    description:
      'Declare what your agent can do — network, filesystem, subprocess. Skills exceeding the budget are rejected before they run.'
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
          <p className="text-muted-foreground text-[15px]">Three steps from install to verified.</p>
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
              <p className="text-[13px] text-muted-foreground leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
