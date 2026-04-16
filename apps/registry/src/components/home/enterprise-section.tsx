import { Building2 } from 'lucide-react';
import { motion } from 'motion/react';

const CAPABILITIES = [
  {
    title: 'Setup wizard',
    description:
      '7-step guided deployment — database, storage, auth providers, scanner LLM, admin user. Production-ready in minutes.'
  },
  {
    title: 'Admin panel',
    description:
      'Full moderation dashboard — manage users, packages, organizations. Quarantine, ban, rescan. Every action audit-logged.'
  },
  {
    title: 'Flexible storage',
    description:
      'S3-compatible object storage (AWS, MinIO, Cloudflare R2) or local filesystem for single-instance deployments.'
  },
  {
    title: 'SSO & OIDC',
    description:
      'Bring your own identity provider — GitHub OAuth, any OIDC-compliant IdP (Okta, Azure AD, Keycloak), or email/password.'
  },
  {
    title: 'Organizations',
    description:
      'Teams with scoped publishing, member invitations, and role-based access. Service accounts for CI/CD pipelines.'
  },
  {
    title: 'CLI from your instance',
    description:
      'Users install the Tank CLI directly from your instance — pre-configured with your registry URL. No npm required.'
  }
];

export function EnterpriseSection() {
  return (
    <section className="relative z-[1] border-t border-border" aria-label="Self-hosted deployment">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-tank/10 border border-tank/12 mb-4">
            <Building2 className="w-5 h-5 text-tank" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            Run it <span className="text-tank">on your infrastructure</span>
          </h2>
          <p className="text-muted-foreground text-[15px] max-w-lg mx-auto">
            One Docker image. Your database, your storage, your auth. Full control, no data leaves your network.
          </p>
        </motion.div>

        <motion.div
          className="tank-terminal tank-scanlines mx-auto max-w-[500px] rounded overflow-hidden mb-10"
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border">
            <span className="size-2.5 rounded-full bg-red-500/50" />
            <span className="size-2.5 rounded-full bg-yellow-500/50" />
            <span className="size-2.5 rounded-full bg-tank/50" />
            <span className="ml-2 text-[11px] text-muted-foreground/50 font-mono">terminal</span>
          </div>
          <div className="p-5">
            <p className="text-[11px] text-muted-foreground/40 mb-1 font-mono"># Deploy Tank in one command</p>
            <p className="text-sm font-mono">
              <span className="text-tank select-none">$ </span>
              <span className="text-foreground/80">docker compose up -d</span>
            </p>
            <p className="text-[11px] text-muted-foreground/40 mt-3 mb-1 font-mono"># Open the setup wizard</p>
            <p className="text-sm font-mono">
              <span className="text-tank select-none">$ </span>
              <span className="text-foreground/80">open https://tank.internal/setup</span>
            </p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CAPABILITIES.map((cap, i) => (
            <motion.div
              key={cap.title}
              className="rounded border border-border bg-card/30 p-5"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.2 }}>
              <h3 className="text-[14px] font-bold tracking-tight mb-1.5">{cap.title}</h3>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{cap.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
