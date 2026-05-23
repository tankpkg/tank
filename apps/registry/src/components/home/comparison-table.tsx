import { Check, Minus, X } from 'lucide-react';
import { motion } from 'motion/react';

const ROWS: Array<{
  feature: string;
  npm: 'yes' | 'partial' | 'no';
  registries: 'yes' | 'partial' | 'no';
  tank: 'yes' | 'partial' | 'no';
  npmNote?: string;
  registriesNote?: string;
  tankNote?: string;
}> = [
  {
    feature: 'Versioning',
    npm: 'yes',
    npmNote: 'Semver',
    registries: 'partial',
    registriesNote: 'Git tags / none',
    tank: 'yes',
    tankNote: 'Semver + escalation detection'
  },
  {
    feature: 'Lockfile',
    npm: 'yes',
    npmNote: 'package-lock.json',
    registries: 'no',
    registriesNote: 'None',
    tank: 'yes',
    tankNote: 'tank.lock with SHA-512'
  },
  {
    feature: 'Permission model',
    npm: 'no',
    registries: 'no',
    tank: 'yes',
    tankNote: 'Network, filesystem, subprocess'
  },
  {
    feature: 'Security scanning',
    npm: 'partial',
    npmNote: 'npm audit (deps only)',
    registries: 'partial',
    registriesNote: 'Basic / none',
    tank: 'yes',
    tankNote: '6-stage pipeline'
  },
  {
    feature: 'Audit score',
    npm: 'no',
    registries: 'no',
    tank: 'yes',
    tankNote: 'Transparent 0\u201310'
  },
  {
    feature: 'Escalation detection',
    npm: 'no',
    registries: 'no',
    tank: 'yes',
    tankNote: 'Auto-flagged at publish'
  },
  {
    feature: 'Install from URL',
    npm: 'partial',
    npmNote: 'No scanning',
    registries: 'no',
    tank: 'yes',
    tankNote: 'Scanned before install'
  },
  {
    feature: 'Self-hosted',
    npm: 'partial',
    npmNote: 'Verdaccio etc.',
    registries: 'no',
    tank: 'yes',
    tankNote: '7-step setup wizard'
  },
  {
    feature: 'MCP server',
    npm: 'no',
    registries: 'no',
    tank: 'yes',
    tankNote: '17 tools, full CLI parity'
  }
];

function StatusIcon({ status }: { status: 'yes' | 'partial' | 'no' }) {
  if (status === 'yes')
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-tank/15">
        <Check className="w-3 h-3 text-tank" />
      </span>
    );
  if (status === 'partial')
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/15">
        <Minus className="w-3 h-3 text-amber-500" />
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted">
      <X className="w-3 h-3 text-muted-foreground/40" />
    </span>
  );
}

export function ComparisonTable() {
  return (
    <section id="comparison-table" className="relative z-[1] border-t border-border" aria-label="Feature comparison">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            How Tank <span className="text-tank">compares</span>
          </h2>
          <p className="text-muted-foreground text-[15px]">
            Agent skills deserve the same security infrastructure as npm packages — and more.
          </p>
        </motion.div>

        <motion.div
          className="overflow-x-auto rounded border border-border"
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: 0.1 }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/50">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[180px]">
                  Feature
                </th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  npm
                </th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Current Registries
                </th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <span className="text-tank">Tank</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={row.feature} className={`border-b border-border/50 ${i % 2 === 0 ? 'bg-card/20' : ''}`}>
                  <td className="px-4 py-3 font-medium text-[13px]">{row.feature}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <StatusIcon status={row.npm} />
                      {row.npmNote && <span className="text-[11px] text-muted-foreground/50">{row.npmNote}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <StatusIcon status={row.registries} />
                      {row.registriesNote && (
                        <span className="text-[11px] text-muted-foreground/50">{row.registriesNote}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <StatusIcon status={row.tank} />
                      {row.tankNote && <span className="text-[11px] text-tank/70">{row.tankNote}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}
