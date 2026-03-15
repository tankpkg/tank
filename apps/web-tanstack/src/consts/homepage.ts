import type { LucideIcon } from 'lucide-react';
import { Eye, GitBranch, Globe, Lock, Shield, Terminal } from 'lucide-react';

export const features: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: Lock,
    title: 'Integrity Verification',
    description:
      "Every skill pinned with sha512 hashes. If content doesn't match, installation fails. No silent tampering."
  },
  {
    icon: Shield,
    title: 'Permission Budgets',
    description:
      'Declare what your agent can do — network, filesystem, subprocess. Skills exceeding the budget are rejected.'
  },
  {
    icon: Eye,
    title: 'Audit Scores',
    description: 'Transparent 0–10 security score. Static analysis, permission matching, package hygiene — all visible.'
  },
  {
    icon: GitBranch,
    title: 'Enforced Semver',
    description:
      'Not a social contract. A patch that adds network access? Detected and flagged. Permission escalation requires a major bump.'
  },
  {
    icon: Terminal,
    title: 'CLI-First Workflow',
    description: 'Install, publish, audit, manage permissions from terminal. Designed for developers, not dashboards.'
  },
  {
    icon: Globe,
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
      'Every skill goes through 6 stages: ingestion (SHA-512 hashing), structure validation, static analysis (Semgrep + Bandit), injection detection, secrets scanning (detect-secrets), and dependency audit (OSV). Skills receive a 0\u201310 audit score and a verdict: PASS, FLAGGED, or FAIL.'
  },
  {
    question: 'Who built Tank?',
    answer:
      'Tank is built by developers who saw the ClawHavoc incident \u2014 where 341 malicious skills (12% of a major marketplace) distributed credential-stealing malware \u2014 and decided AI agent skills deserved the same security infrastructure as npm packages.'
  }
];
