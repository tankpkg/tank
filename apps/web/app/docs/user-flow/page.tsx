import { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
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
  Zap,
  Search,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Star,
  Link2,
  Stethoscope,
  Menu,
  X,
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Package className="h-6 w-6 text-primary" />
              <span className="font-bold text-xl">Tank</span>
            </Link>
            <nav className="hidden md:flex items-center gap-8">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Home
              </Link>
              <Link href="/skills" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Skills
              </Link>
              <Link href="/docs/user-flow" className="text-sm font-medium text-foreground">
                User Guide
              </Link>
            </nav>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center justify-center h-9 px-4 py-2 text-sm font-medium rounded-md border bg-background shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </Link>
              <Link
                href="/skills"
                className="hidden sm:inline-flex items-center justify-center h-9 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap shrink-0"
              >
                Get Started
              </Link>
              {/* Mobile menu button */}
              <button className="md:hidden p-2 text-muted-foreground hover:text-foreground">
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="border-b bg-gradient-to-b from-muted/50 to-background">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline" className="mb-6">
                <Star className="mr-1.5 h-3.5 w-3.5" />
                Complete User Guide
              </Badge>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                Tank User Flow
              </h1>
              <p className="mt-4 text-xl sm:text-2xl font-semibold text-primary">
                Everything You Need to Know
              </p>
              <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                A security-first package manager for AI agent skills. Learn how to discover, install, and publish skills safely.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/skills"
                  className="inline-flex items-center justify-center h-10 px-6 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full sm:w-auto whitespace-nowrap shrink-0"
                >
                  Browse Skills
                </Link>
                <a
                  href="#quick-start"
                  className="inline-flex items-center justify-center h-10 px-6 text-sm font-medium rounded-md border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground transition-colors w-full sm:w-auto whitespace-nowrap shrink-0"
                >
                  Quick Start
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Overview */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
              <div className="text-center mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold">Tank Ecosystem Overview</h2>
                <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                  Three ways to interact with Tank, depending on your role
                </p>
              </div>

              <div className="grid gap-6 sm:gap-8 md:grid-cols-3">
                <Card className="relative overflow-hidden group hover:shadow-lg transition-shadow">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent" />
                  <CardHeader>
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
                      <Users className="h-6 w-6 text-blue-500" />
                    </div>
                    <CardTitle>Developers</CardTitle>
                    <CardDescription>Create and publish skills</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">tank init</code> to scaffold
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">tank publish</code> to registry
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">--dry-run</code> to test
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="relative overflow-hidden group hover:shadow-lg transition-shadow">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-transparent" />
                  <CardHeader>
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10">
                      <Package className="h-6 w-6 text-green-500" />
                    </div>
                    <CardTitle>Consumers</CardTitle>
                    <CardDescription>Discover and use skills</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">tank search</code> to find
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">tank info</code> to inspect
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">tank install</code> safely
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="relative overflow-hidden group hover:shadow-lg transition-shadow">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-transparent" />
                  <CardHeader>
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10">
                      <Building2 className="h-6 w-6 text-purple-500" />
                    </div>
                    <CardTitle>Admins</CardTitle>
                    <CardDescription>Manage via web dashboard</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        Organizations
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        API tokens
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        Team management
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* The Problem */}
        <section className="py-16 md:py-24 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl">
              <div className="flex items-center gap-3 mb-8 justify-center">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <h2 className="text-2xl sm:text-3xl font-bold">Why Tank Exists</h2>
              </div>

              <Card className="border-destructive/20 bg-destructive/5 mb-8">
                <CardHeader>
                  <CardTitle className="text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    February 2026: ClawHavoc Incident
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 text-sm sm:text-base">
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-xs font-bold text-destructive">1</span>
                      <span>341 malicious skills discovered (12% of a marketplace)</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-xs font-bold text-destructive">2</span>
                      <span>Skills run with FULL agent authority (read files, API calls, shell commands)</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-xs font-bold text-destructive">3</span>
                      <span>No versioning or lockfiles - supply chain attacks possible</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <div className="flex justify-center py-4">
                <ArrowRight className="h-8 w-8 text-muted-foreground rotate-90" />
              </div>

              <Card className="border-green-500/20 bg-green-500/5">
                <CardHeader>
                  <CardTitle className="text-green-600 dark:text-green-400 flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Tank Solution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      "sha512 integrity verification",
                      "Permission budgets",
                      "6-stage security scanning (0-10)",
                      "Lockfiles for reproducibility",
                      "Semver versioning enforced",
                      "Safe tarball extraction",
                    ].map((feature) => (
                      <div key={feature} className="flex items-center gap-2 text-sm sm:text-base">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <Separator />

        {/* Real CLI Commands */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
              <div className="text-center mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold">Real CLI Commands</h2>
                <p className="mt-4 text-muted-foreground">14 fully implemented commands</p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Lock className="h-4 w-4 text-primary" />
                      </div>
                      Authentication
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <CommandRow cmd="tank login" desc="Browser OAuth" />
                      <CommandRow cmd="tank logout" desc="Remove token" />
                      <CommandRow cmd="tank whoami" desc="Current user" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Package className="h-4 w-4 text-primary" />
                      </div>
                      Skill Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <CommandRow cmd="tank init" desc="Create skills.json" />
                      <CommandRow cmd="tank publish" desc="Publish to registry" />
                      <CommandRow cmd="tank search" desc="Find skills" />
                      <CommandRow cmd="tank info" desc="Skill details" />
                      <CommandRow cmd="tank audit" desc="Security results" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Download className="h-4 w-4 text-primary" />
                      </div>
                      Installation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <CommandRow cmd="tank install" desc="Install skill" />
                      <CommandRow cmd="tank update" desc="Update version" />
                      <CommandRow cmd="tank remove" desc="Remove skill" />
                      <CommandRow cmd="tank verify" desc="Check lockfile" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Link2 className="h-4 w-4 text-primary" />
                      </div>
                      Agent Integration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <CommandRow cmd="tank permissions" desc="Permission summary" />
                      <CommandRow cmd="tank link" desc="Link to agents" />
                      <CommandRow cmd="tank unlink" desc="Remove links" />
                      <CommandRow cmd="tank doctor" desc="Diagnose issues" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-8 p-4 rounded-lg bg-muted/50 text-center">
                <p className="text-sm text-muted-foreground">
                  <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs">-g, --global</code>
                  <span className="mx-2">for global install</span>
                  <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs">--dry-run</code>
                  <span className="mx-2">for publish test</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* User Flows */}
        <section className="py-16 md:py-24 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">
              <div className="text-center mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold">User Workflows</h2>
                <p className="mt-4 text-muted-foreground">Step-by-step guides for each user type</p>
              </div>

              <Tabs defaultValue="consumer" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-8 h-12 bg-transparent gap-2">
                  <TabsTrigger
                    value="consumer"
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-muted data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground data-[state=active]:text-primary-foreground transition-colors"
                  >
                    <Package className="h-4 w-4" />
                    <span className="hidden sm:inline">Consumer</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="developer"
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-muted data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground data-[state=active]:text-primary-foreground transition-colors"
                  >
                    <Users className="h-4 w-4" />
                    <span className="hidden sm:inline">Developer</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="admin"
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-muted data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground data-[state=active]:text-primary-foreground transition-colors"
                  >
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </TabsTrigger>
                </TabsList>

                {/* Consumer Flow */}
                <TabsContent value="consumer" className="space-y-6 mt-0">
                  <FlowStep
                    number={1}
                    title="Authenticate"
                    icon={<Lock className="h-5 w-5" />}
                    command={`$ tank login

Opening browser for authentication...
Waiting for authorization...
✓ Logged in as yourname@example.com`}
                  />

                  <FlowStep
                    number={2}
                    title="Discover Skills"
                    icon={<Search className="h-5 w-5" />}
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
                    icon={<Download className="h-5 w-5" />}
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
                    icon={<Shield className="h-5 w-5" />}
                    command={`$ tank verify
✓ All skills match lockfile

$ tank audit

@tank/feature-dev@3.0.0
Score: 9.5/10  Status: pass`}
                  />
                </TabsContent>

                {/* Developer Flow */}
                <TabsContent value="developer" className="space-y-6 mt-0">
                  <FlowStep
                    number={1}
                    title="Initialize Skill"
                    icon={<Terminal className="h-5 w-5" />}
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
                    icon={<FileCheck className="h-5 w-5" />}
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
                    icon={<Upload className="h-5 w-5" />}
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
                <TabsContent value="admin" className="space-y-6 mt-0">
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Building2 className="h-5 w-5 text-primary" />
                        Web Dashboard Only
                      </CardTitle>
                      <CardDescription>
                        Organization and token management is available via the web UI
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <FlowStep
                    number={1}
                    title="Access Dashboard"
                    icon={<Building2 className="h-5 w-5" />}
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
                    icon={<Users className="h-5 w-5" />}
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

        <Separator />

        {/* Security Layers */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
              <div className="text-center mb-12">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold">Security Features</h2>
                <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                  Built-in security at every layer of the package lifecycle
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <SecurityLayer
                  layer={1}
                  title="Integrity Verification"
                  description="Every tarball hashed with sha512"
                  icon={<Lock className="h-5 w-5" />}
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
                  icon={<Eye className="h-5 w-5" />}
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
                  icon={<Shield className="h-5 w-5" />}
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
                  icon={<FileCheck className="h-5 w-5" />}
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

        <Separator />

        {/* Quick Start */}
        <section id="quick-start" className="py-16 md:py-24 bg-primary/5">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <div className="text-center mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold">Get Started in 5 Minutes</h2>
                <p className="mt-4 text-muted-foreground">
                  Start using Tank to securely manage AI agent skills
                </p>
              </div>

              <div className="space-y-4">
                {[
                  { step: 1, title: "Install Tank CLI", cmd: "npm install -g @tankpkg/cli" },
                  { step: 2, title: "Authenticate", cmd: "tank login" },
                  { step: 3, title: "Search & Install", cmd: 'tank search "your need"' },
                  { step: 4, title: "Verify & Use", cmd: "tank verify && tank doctor" },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-4 p-4 sm:p-5 rounded-xl bg-background border shadow-sm">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                      {item.step}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{item.title}</p>
                      <code className="text-sm text-muted-foreground block mt-1 overflow-x-auto">
                        {item.cmd}
                      </code>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 text-center">
                <Link
                  href="/skills"
                  className="inline-flex items-center justify-center h-10 px-6 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap shrink-0"
                >
                  Browse Skills Registry
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/" className="flex items-center gap-1.5 font-semibold text-foreground hover:opacity-80 transition-opacity">
                <Package className="h-5 w-5" />
                Tank
              </Link>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">Security-first package manager for AI agent skills</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/skills" className="hover:text-foreground transition-colors">
                Skills
              </Link>
              <Link href="/docs/user-flow" className="hover:text-foreground transition-colors">
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
      <code className="text-primary font-mono text-xs sm:text-sm bg-primary/5 px-2 py-1 rounded">
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
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 bg-muted/30">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
            {number}
          </span>
          <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
          <div className="text-muted-foreground ml-auto">{icon}</div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <pre className="overflow-x-auto p-4 text-xs sm:text-sm text-green-400 font-mono bg-[#0f172a]">
          {command}
        </pre>
      </CardContent>
    </Card>
  );
}

function SecurityLayer({
  layer,
  title,
  description,
  icon,
  benefits,
}: {
  layer: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  benefits: string[];
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
            L{layer}
          </span>
          <div className="text-primary">{icon}</div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
        <CardDescription className="ml-11">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 ml-11">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              {benefit}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
