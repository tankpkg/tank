export const features = [
  {
    icon: 'lock',
    title: 'Integrity Verification',
    description:
      "Every skill pinned with sha512 hashes. If content doesn't match, installation fails. No silent tampering."
  },
  {
    icon: 'shield',
    title: 'Permission Budgets',
    description:
      'Declare what your agent can do — network, filesystem, subprocess. Skills exceeding the budget are rejected.'
  },
  {
    icon: 'eye',
    title: 'Audit Scores',
    description: 'Transparent 0–10 security score. Static analysis, permission matching, package hygiene — all visible.'
  },
  {
    icon: 'git-branch',
    title: 'Enforced Semver',
    description:
      'Not a social contract. A patch that adds network access? Detected and flagged. Permission escalation requires a major bump.'
  },
  {
    icon: 'terminal',
    title: 'CLI-First Workflow',
    description: 'Install, publish, audit, manage permissions from terminal. Designed for developers, not dashboards.'
  },
  {
    icon: 'globe',
    title: 'Open Source (MIT)',
    description: 'Built in the open from day one. MIT licensed. Transparent scanning. No vendor lock-in.'
  }
];

export const cliCommands = [
  { cmd: 'tank install @vercel/next-skill', desc: 'Install with integrity verification' },
  { cmd: 'tank permissions', desc: 'See what your agent can do' },
  { cmd: 'tank audit', desc: 'Check security scan results' },
  { cmd: 'tank publish', desc: 'Publish with 6-stage analysis' }
];

export const faqItems = [
  {
    question: 'What is Tank?',
    answer:
      'Tank is a security-first package manager for AI agent skills. It provides integrity verification (SHA-512), permission budgets, 6-stage security scanning, and enforced semver — features that current skill registries lack.'
  },
  {
    question: 'How is this different from npm?',
    answer:
      'npm manages JavaScript packages. Tank manages AI agent skills — the reusable capabilities you add to coding agents like Claude Code or Cursor. Unlike npm, Tank enforces permission budgets and scans every package through a 6-stage security pipeline before publication.'
  },
  {
    question: 'Is Tank free?',
    answer:
      'Yes. Tank is open source under the MIT license. The registry, CLI, and security scanner are all free to use.'
  },
  {
    question: 'How does the security scanning work?',
    answer:
      'Every skill goes through 6 stages: ingestion (SHA-512 hashing), structure validation, static analysis (Semgrep + Bandit), injection detection, secrets scanning (detect-secrets), and dependency audit (OSV). Skills receive a 0–10 audit score and a verdict: PASS, FLAGGED, or FAIL.'
  },
  {
    question: 'Who built Tank?',
    answer:
      'Tank is built by developers who saw the ClawHavoc incident — where 341 malicious skills (12% of a major marketplace) distributed credential-stealing malware — and decided AI agent skills deserved the same security infrastructure as npm packages.'
  }
];

export const featureIcons: Record<string, string> = {
  lock: '<path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Z"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  'git-branch':
    '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'
};
