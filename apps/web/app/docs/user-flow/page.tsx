import { Metadata } from "next";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import {
  Shield,
  Users,
  Building2,
  Package,
  Terminal,
  Lock,
  Eye,
  FileCheck,
  Search,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Fingerprint,
  Radar,
} from "lucide-react";

export const metadata: Metadata = {
  title: "User Guide | Tank - Security-First Package Manager for AI Skills",
  description: "Complete guide to using Tank: discover, install, and publish AI agent skills securely. Learn CLI commands, security features, and best practices.",
  keywords: ["Tank", "AI skills", "package manager", "CLI", "security", "AI agents", "Claude Code", "developer tools"],
  openGraph: {
    title: "User Guide | Tank Package Manager",
    description: "Learn how to use Tank to securely manage AI agent skills",
    type: "article",
  },
};

export default function UserFlowPage() {
  return (
    <div className="min-h-screen bg-background tank-gradient-bg tank-grid-overlay">
      {/* Decorative orbs - subtle Matrix green only */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="tank-orb tank-orb-green w-[600px] h-[600px] -top-48 left-1/4 opacity-30" />
        <div className="tank-orb tank-orb-green w-[400px] h-[400px] bottom-0 right-1/4 opacity-20" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-emerald-500/10 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-all group">
              <Image src="/logo.png" alt="Tank" width={24} height={24} className="rounded-sm" />
              <span className="font-bold text-xl">Tank</span>
            </Link>
            <nav className="hidden md:flex items-center gap-8">
              <Link href="/" className="text-sm text-muted-foreground hover:text-emerald-400 transition-colors">
                Home
              </Link>
              <Link href="/skills" className="text-sm text-muted-foreground hover:text-emerald-400 transition-colors">
                Skills
              </Link>
              <Link href="/docs/user-flow" className="text-sm font-medium text-emerald-400">
                User Guide
              </Link>
            </nav>
            <div className="flex items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button size="sm" asChild className="bg-emerald-600 hover:bg-emerald-500 text-white">
                <Link href="/skills">Get Started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="tank-hero-gradient relative overflow-hidden">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 mb-6">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-400">Complete User Guide</span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                Tank User Flow
              </h1>

              <p className="mt-3 text-lg text-emerald-400 font-medium">
                Everything You Need to Know
              </p>

              <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
                A security-first package manager for AI agent skills. Learn how to discover, install, and publish skills safely.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" asChild className="bg-emerald-600 hover:bg-emerald-500 text-white group">
                  <Link href="/skills">
                    Browse Skills
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <a href="#quick-start">Quick Start</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Overview */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">
              <div className="text-center mb-10">
                <h2 className="text-2xl sm:text-3xl font-bold">Ecosystem Overview</h2>
                <p className="mt-3 text-muted-foreground">Three ways to interact with Tank</p>
              </div>

              <div className="grid gap-5 md:grid-cols-3">
                {/* Developers Card */}
                <Card className="tank-card bg-card/50 group relative overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                      <Users className="h-5 w-5 text-emerald-400" />
                    </div>
                    <CardTitle className="text-base">Developers</CardTitle>
                    <CardDescription>Create and publish skills</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">tank init</code>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">tank publish</code>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">--dry-run</code>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                {/* Consumers Card */}
                <Card className="tank-card bg-card/50 group relative overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                      <Package className="h-5 w-5 text-emerald-400" />
                    </div>
                    <CardTitle className="text-base">Consumers</CardTitle>
                    <CardDescription>Discover and use skills</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">tank search</code>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">tank info</code>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">tank install</code>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                {/* Admins Card */}
                <Card className="tank-card bg-card/50 group relative overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                      <Building2 className="h-5 w-5 text-emerald-400" />
                    </div>
                    <CardTitle className="text-base">Admins</CardTitle>
                    <CardDescription>Manage via web dashboard</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        Organizations
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        API tokens
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        Team management
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <div className="tank-divider" />

        {/* The Problem */}
        <section className="py-16 md:py-20 relative">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center gap-3 mb-6 justify-center">
                <AlertTriangle className="h-6 w-6 text-red-400" />
                <h2 className="text-2xl sm:text-3xl font-bold">Why Tank Exists</h2>
              </div>

              <Card className="border-red-500/20 bg-red-500/5 mb-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-red-400 flex items-center gap-2 text-base">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    February 2026: ClawHavoc Incident
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <ul className="space-y-2">
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-400">1</span>
                      <span><strong className="text-red-400">341 malicious skills</strong> discovered (12% of a marketplace)</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-400">2</span>
                      <span>Skills run with <strong>FULL agent authority</strong> (read files, API calls, shell commands)</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-400">3</span>
                      <span>No versioning or lockfiles — supply chain attacks possible</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <div className="flex justify-center py-3">
                <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90" />
              </div>

              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-emerald-400 flex items-center gap-2 text-base">
                    <Shield className="h-4 w-4" />
                    Tank Solution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2 text-sm">
                    {[
                      "sha512 integrity verification",
                      "Permission budgets",
                      "6-stage security scanning",
                      "Lockfiles for reproducibility",
                      "Semver versioning enforced",
                      "Safe tarball extraction",
                    ].map((feature) => (
                      <div key={feature} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <div className="tank-divider" />

        {/* Real CLI Commands */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">
              <div className="text-center mb-10">
                <h2 className="text-2xl sm:text-3xl font-bold">CLI Commands</h2>
                <p className="mt-2 text-muted-foreground">14 fully implemented commands</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Authentication */}
                <Card className="tank-card bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Lock className="h-4 w-4 text-emerald-400" />
                      Authentication
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <CommandRow cmd="tank login" desc="Browser OAuth" />
                      <CommandRow cmd="tank logout" desc="Remove token" />
                      <CommandRow cmd="tank whoami" desc="Current user" />
                    </div>
                  </CardContent>
                </Card>

                {/* Skill Management */}
                <Card className="tank-card bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Package className="h-4 w-4 text-emerald-400" />
                      Skill Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <CommandRow cmd="tank init" desc="Create skills.json" />
                      <CommandRow cmd="tank publish" desc="Publish to registry" />
                      <CommandRow cmd="tank search" desc="Find skills" />
                      <CommandRow cmd="tank info" desc="Skill details" />
                      <CommandRow cmd="tank audit" desc="Security results" />
                    </div>
                  </CardContent>
                </Card>

                {/* Installation */}
                <Card className="tank-card bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Download className="h-4 w-4 text-emerald-400" />
                      Installation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <CommandRow cmd="tank install" desc="Install skill" />
                      <CommandRow cmd="tank update" desc="Update version" />
                      <CommandRow cmd="tank remove" desc="Remove skill" />
                      <CommandRow cmd="tank verify" desc="Check lockfile" />
                    </div>
                  </CardContent>
                </Card>

                {/* Agent Integration */}
                <Card className="tank-card bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-emerald-400" />
                      Agent Integration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <CommandRow cmd="tank permissions" desc="Permission summary" />
                      <CommandRow cmd="tank link" desc="Link to agents" />
                      <CommandRow cmd="tank unlink" desc="Remove links" />
                      <CommandRow cmd="tank doctor" desc="Diagnose issues" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-6 p-3 rounded-lg bg-muted/50 text-center text-sm text-muted-foreground">
                <code className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono">-g, --global</code>
                <span className="mx-2">for global install</span>
                <code className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono">--dry-run</code>
                <span className="mx-2">for publish test</span>
              </div>
            </div>
          </div>
        </section>

        <div className="tank-divider" />

        {/* User Flows */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl">
              <div className="text-center mb-10">
                <h2 className="text-2xl sm:text-3xl font-bold">User Workflows</h2>
                <p className="mt-2 text-muted-foreground">Step-by-step guides for each user type</p>
              </div>

              <Tabs defaultValue="consumer" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6 h-auto bg-transparent gap-2">
                  <TabsTrigger
                    value="consumer"
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-muted/50 data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-muted-foreground transition-all"
                  >
                    <Package className="h-4 w-4" />
                    <span className="hidden sm:inline">Consumer</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="developer"
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-muted/50 data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-muted-foreground transition-all"
                  >
                    <Users className="h-4 w-4" />
                    <span className="hidden sm:inline">Developer</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="admin"
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-muted/50 data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-muted-foreground transition-all"
                  >
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </TabsTrigger>
                </TabsList>

                {/* Consumer Flow */}
                <TabsContent value="consumer" className="space-y-4 mt-0">
                  <FlowStep
                    number={1}
                    title="Authenticate"
                    icon={<Lock className="h-4 w-4" />}
                    command={`$ tank login

Opening browser for authentication...
Waiting for authorization...
✓ Logged in as yourname@example.com`}
                  />

                  <FlowStep
                    number={2}
                    title="Discover Skills"
                    icon={<Search className="h-4 w-4" />}
                    command={`$ tank search "code review"

┌────────────────────────────────────────────────┐
│ Name                Version  Score  Description │
├────────────────────────────────────────────────┤
│ @security/reviewer  2.1.0    9.2   Review skill│
│ @tank/feature-dev   3.0.0    9.5   Planning    │
└────────────────────────────────────────────────┘`}
                  />

                  <FlowStep
                    number={3}
                    title="Inspect & Install"
                    icon={<Download className="h-4 w-4" />}
                    command={`$ tank info @tank/feature-dev

Name:        @tank/feature-dev
Version:     3.0.0
Audit Score: 9.5/10 ████████████░
Status:      pass

$ tank install @tank/feature-dev

✓ Verifying integrity (sha512)...
✓ Updating skills.lock
✓ Linking to Claude Code

Installed @tank/feature-dev@3.0.0`}
                  />

                  <FlowStep
                    number={4}
                    title="Verify & Audit"
                    icon={<Shield className="h-4 w-4" />}
                    command={`$ tank verify
✓ All skills match lockfile

$ tank audit

@tank/feature-dev@3.0.0
Score: 9.5/10  Status: pass`}
                  />
                </TabsContent>

                {/* Developer Flow */}
                <TabsContent value="developer" className="space-y-4 mt-0">
                  <FlowStep
                    number={1}
                    title="Initialize Skill"
                    icon={<Terminal className="h-4 w-4" />}
                    command={`$ tank init

? Skill name: my-code-reviewer
? Version: 1.0.0
? Description: Automated code review skill
? Author: Your Name

✓ Created skills.json`}
                  />

                  <FlowStep
                    number={2}
                    title="Create SKILL.md"
                    icon={<FileCheck className="h-4 w-4" />}
                    command={`# SKILL.md
---
name: my-code-reviewer
version: 1.0.0
---

## Purpose
Reviews code for security issues and
best practices.

## Usage
Point me to a file to analyze it.`}
                  />

                  <FlowStep
                    number={3}
                    title="Publish"
                    icon={<Upload className="h-4 w-4" />}
                    command={`$ tank publish

✓ Validating skills.json...
✓ Packing skill directory...
• Files: 3  Size: 4.2KB
✓ Uploading to registry...
✓ Triggering security scan...

Published my-code-reviewer@1.0.0

Test first? Use: tank publish --dry-run`}
                  />
                </TabsContent>

                {/* Admin Flow */}
                <TabsContent value="admin" className="space-y-4 mt-0">
                  <Card className="border-emerald-500/20 bg-emerald-500/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm text-emerald-400">
                        <Building2 className="h-4 w-4" />
                        Web Dashboard Only
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Organization and token management via web UI
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <FlowStep
                    number={1}
                    title="Access Dashboard"
                    icon={<Building2 className="h-4 w-4" />}
                    command={`Public Pages:
/                  Landing page
/skills            Browse registry
/skills/[name]     Skill details

Authenticated Pages:
/dashboard         Quick links
/dashboard/orgs    Organizations
/dashboard/tokens  API tokens`}
                  />

                  <FlowStep
                    number={2}
                    title="Manage Resources"
                    icon={<Users className="h-4 w-4" />}
                    command={`/dashboard/orgs
• View your organizations
• Create new organizations

/dashboard/tokens
• View active tokens
• Create/revoke tokens

Tokens are used for CI/CD and
programmatic API access`}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </section>

        <div className="tank-divider" />

        {/* Security Layers */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">
              <div className="text-center mb-10">
                <Shield className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                <h2 className="text-2xl sm:text-3xl font-bold">Security Features</h2>
                <p className="mt-2 text-muted-foreground">Built-in security at every layer</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <SecurityLayer
                  layer={1}
                  title="Integrity Verification"
                  description="Every tarball hashed with sha512"
                  benefits={[
                    "Prevents tampering in transit",
                    "Guarantees reproducible installs",
                    "Verified on every install",
                  ]}
                />

                <SecurityLayer
                  layer={2}
                  title="Permission Budgets"
                  description="Skills declare what they can do"
                  benefits={[
                    "network: outbound domains",
                    "filesystem: read/write paths",
                    "subprocess: enabled/disabled",
                  ]}
                />

                <SecurityLayer
                  layer={3}
                  title="6-Stage Security Scan"
                  description="0-10 audit score for every skill"
                  benefits={[
                    "Ingest & structure validation",
                    "Static analysis & injection detection",
                    "Secrets & dependency scanning",
                  ]}
                />

                <SecurityLayer
                  layer={4}
                  title="Safe Extraction"
                  description="Tarball extraction security"
                  benefits={[
                    "Path traversal prevention",
                    "Symlink attack protection",
                    "Target directory confinement",
                  ]}
                />
              </div>
            </div>
          </div>
        </section>

        <div className="tank-divider" />

        {/* Quick Start */}
        <section id="quick-start" className="py-16 md:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl">
              <div className="text-center mb-10">
                <h2 className="text-2xl sm:text-3xl font-bold">Get Started in 5 Minutes</h2>
                <p className="mt-2 text-muted-foreground">Start using Tank to securely manage AI agent skills</p>
              </div>

              <div className="space-y-3">
                {[
                  { step: 1, title: "Install Tank CLI", cmd: "npm install -g @tankpkg/cli" },
                  { step: 2, title: "Authenticate", cmd: "tank login" },
                  { step: 3, title: "Search & Install", cmd: 'tank search "your need"' },
                  { step: 4, title: "Verify & Use", cmd: "tank verify && tank doctor" },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="flex items-start gap-4 p-4 rounded-lg bg-card border border-emerald-500/10 hover:border-emerald-500/30 transition-colors"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white font-bold text-xs">
                      {item.step}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{item.title}</p>
                      <code className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono block mt-1">
                        {item.cmd}
                      </code>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 text-center">
                <Button size="lg" asChild className="bg-emerald-600 hover:bg-emerald-500 text-white group">
                  <Link href="/skills">
                    Browse Skills Registry
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-emerald-500/10 bg-background/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/" className="flex items-center gap-2 font-semibold text-foreground hover:opacity-80 transition-opacity">
                <Image src="/logo.png" alt="Tank" width={20} height={20} className="rounded-sm" />
                <span>Tank</span>
              </Link>
              <span className="hidden sm:inline text-muted-foreground/30">•</span>
              <span className="hidden sm:inline">Security-first package manager for AI agent skills</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/skills" className="hover:text-emerald-400 transition-colors">
                Skills
              </Link>
              <Link href="/docs/user-flow" className="hover:text-emerald-400 transition-colors">
                User Guide
              </Link>
              <a
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Helper Components
function CommandRow({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <code className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono">
        {cmd}
      </code>
      <span className="text-muted-foreground text-xs whitespace-nowrap">{desc}</span>
    </div>
  );
}

function FlowStep({
  number,
  title,
  icon,
  command,
}: {
  number: number;
  title: string;
  icon: React.ReactNode;
  command: string;
}) {
  return (
    <Card className="overflow-hidden tank-card bg-card/50">
      <CardHeader className="pb-2 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white font-bold text-xs">
            {number}
          </span>
          <CardTitle className="text-sm">{title}</CardTitle>
          <div className="text-emerald-400 ml-auto">{icon}</div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="tank-terminal tank-scanlines">
          <pre className="overflow-x-auto p-3 text-xs text-emerald-400 font-mono">
            {command}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

function SecurityLayer({
  layer,
  title,
  description,
  benefits,
}: {
  layer: number;
  title: string;
  description: string;
  benefits: string[];
}) {
  return (
    <Card className="tank-card bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-600/20 text-emerald-400 font-bold text-xs border border-emerald-500/20">
            L{layer}
          </span>
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 ml-[42px]">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              {benefit}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
