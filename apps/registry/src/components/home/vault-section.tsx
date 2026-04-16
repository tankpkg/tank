import { KeyRound, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

const CREDENTIAL_TYPES = [
  { prefix: 'sk_live_', label: 'Stripe' },
  { prefix: 'AKIA', label: 'AWS' },
  { prefix: 'ghp_', label: 'GitHub' },
  { prefix: 'sk-proj-', label: 'OpenAI' },
  { prefix: 'eyJ...', label: 'JWT' },
  { prefix: 'postgresql://', label: 'Database URLs' },
  { prefix: 'elvn_', label: 'ElevenLabs' },
  { prefix: 'hooks.slack.com', label: 'Slack Webhooks' }
];

const VAULT_LAYERS = [
  { step: '1', label: 'Detect', desc: '10 credential patterns matched via regex' },
  { step: '2', label: 'Tokenize', desc: 'CSPRNG format-preserving fakes generated' },
  { step: '3', label: 'Proxy', desc: 'HTTP intercept swaps fakes before LLM sees them' },
  { step: '4', label: 'Restore', desc: 'Real credentials restored in agent output' }
];

export function VaultSection() {
  return (
    <section className="relative z-[1] border-t border-border" aria-label="Credential Vault">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-tank/10 border border-tank/12 mb-4">
            <KeyRound className="w-5 h-5 text-tank" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            Your secrets <span className="text-tank">never leave your machine</span>
          </h2>
          <p className="text-muted-foreground text-[15px] max-w-lg mx-auto">
            The Credential Vault intercepts API keys before they reach any LLM provider. Format-preserving tokenization
            means agents work normally — but real credentials stay local.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <motion.div
            className="tank-terminal tank-scanlines rounded overflow-hidden"
            initial={{ opacity: 0, x: -15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3 }}>
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border">
              <span className="size-2.5 rounded-full bg-red-500/50" />
              <span className="size-2.5 rounded-full bg-yellow-500/50" />
              <span className="size-2.5 rounded-full bg-tank/50" />
              <span className="ml-2 text-[11px] text-muted-foreground/50 font-mono">credential vault</span>
              <span className="ml-auto flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3 text-tank" />
                <span className="text-[11px] text-tank font-mono">protected</span>
              </span>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-[11px] text-muted-foreground/40 mb-1 font-mono">
                  # Launch agent with vault protection
                </p>
                <p className="text-sm font-mono">
                  <span className="text-tank select-none">$ </span>
                  <span className="text-foreground/80">tank run claude</span>
                </p>
              </div>
              <div className="border-t border-border/50" />
              <div className="space-y-1.5">
                <p className="text-[12px] font-mono text-tank">vault</p>
                <p className="text-[12px] font-mono text-muted-foreground/70">
                  {'  '}Detected <span className="text-amber-400">3 credentials</span> in environment
                </p>
                <p className="text-[12px] font-mono text-muted-foreground/70">
                  {'  '}
                  <span className="text-muted-foreground/40">├</span> sk_live_4eC39H → sk_live_
                  <span className="text-tank">fK9mR2vL8nP3</span>
                </p>
                <p className="text-[12px] font-mono text-muted-foreground/70">
                  {'  '}
                  <span className="text-muted-foreground/40">├</span> AKIAIOSFODNN → AKIA
                  <span className="text-tank">XQMR7NWG5BPT</span>
                </p>
                <p className="text-[12px] font-mono text-muted-foreground/70">
                  {'  '}
                  <span className="text-muted-foreground/40">└</span> ghp_xxMJsa91 → ghp_
                  <span className="text-tank">kL4nR8vP2mQ6wX</span>
                </p>
              </div>
              <div className="border-t border-border/50" />
              <p className="text-[12px] font-mono text-tank">
                proxy listening on 127.0.0.1:9384
                <br />
                <span className="text-muted-foreground/70">launching claude with vault protection...</span>
              </p>
            </div>
          </motion.div>

          <motion.div
            className="space-y-5"
            initial={{ opacity: 0, x: 15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: 0.1 }}>
            <div className="space-y-2.5">
              {VAULT_LAYERS.map((layer, i) => (
                <motion.div
                  key={layer.label}
                  className="rounded border border-border bg-card/30 px-4 py-3 flex items-start gap-3"
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06, duration: 0.2 }}>
                  <span className="flex-none mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-tank/10 text-[11px] font-bold text-tank border border-tank/20">
                    {layer.step}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold tracking-tight">{layer.label}</p>
                    <p className="text-[12px] text-muted-foreground">{layer.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="rounded border border-border bg-card/30 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-3">
                Detected credential types
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CREDENTIAL_TYPES.map((cred) => (
                  <span
                    key={cred.label}
                    className="inline-flex items-center rounded border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                    {cred.label}
                  </span>
                ))}
              </div>
            </div>

            <p className="text-[12px] text-muted-foreground text-center">
              Works with{' '}
              <span className="font-medium text-foreground">Claude Code, Cursor, OpenCode, Codex, and any agent</span>
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
