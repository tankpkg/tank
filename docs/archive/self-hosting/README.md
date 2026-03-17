# Self-Hosting Tank

This guide covers deploying Tank as a self-hosted registry for your organization.

## Prerequisites

- Node.js 24+
- PostgreSQL 15+
- Python 3.14+ (for security scanning)
- S3-compatible storage or Supabase

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/tankpkg/tank.git
cd tank
pnpm install
```

### 2. Configure Environment

```bash
cp apps/registry-legacy/.env.example apps/registry-legacy/.env.local
```

Edit `.env.local` with your settings:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/tank"

# Authentication
BETTER_AUTH_SECRET="your-secret-key"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# Storage
STORAGE_BACKEND="supabase"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### 3. Initialize Database

```bash
pnpm --filter=web drizzle-kit push
```

### 4. Start Development Server

```bash
pnpm dev
```

## White-Label Customization

Tank supports full white-label customization. See the [White-Label Setup Guide](./white-label.md) for:

- Custom brand name and logo
- Custom color themes
- Social media links
- "Powered by Tank" attribution

Quick customization:

```bash
# Brand settings
BRAND_NAME="Your Company"
BRAND_LOGO_URL="/brand/logo.png"
BRAND_COLOR_PRIMARY="3b82f6"
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CLI (tank)     │────▶│   Web Registry   │────▶│   MCP Server     │
│   TypeScript     │     │   Next.js 15     │     │   TypeScript     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  Python API     │
                        │  FastAPI        │
                        │  Security Scan  │
                        └─────────────────┘
```

## Deployment Options

### Vercel (Recommended)

```bash
vercel deploy
```

### Docker

```bash
docker build -t tank-registry ./apps/registry-legacy
docker run -p 3000:3000 tank-registry
```

### Manual

1. Build: `pnpm build`
2. Start: `pnpm start`
3. Run Python API separately

## Documentation

- [White-Label Setup](./white-label.md) — Customize branding
- [Brand Assets Checklist](./assets.md) — Prepare logo, colors
- [API Reference](/docs/api) — REST API docs
- [CLI Reference](/docs/cli) — Command reference

## Support

- GitHub Issues: [tankpkg/tank](https://github.com/tankpkg/tank/issues)
- Documentation: [tankpkg.dev](https://tankpkg.dev)
