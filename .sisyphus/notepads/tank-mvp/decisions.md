# Tank MVP — Decisions

# Tank MVP — Decisions

## 2026-02-14: Switch to Drizzle ORM (user directive)
- **Decision**: Use Drizzle ORM instead of raw SQL
- **Reason**: User explicitly requested `pls use drizzle as db orm`
- **Impact**: Task 1.3 changes from raw SQL migrations to Drizzle schema files
- **Impact**: Task 1.5 better-auth uses Drizzle adapter
- **Packages**: drizzle-orm, drizzle-kit, postgres (node-postgres driver)

## 2026-02-14: Use Remote Supabase (not just local)
- **Decision**: Use hosted Supabase project `lcsbcruorskqflcwlvgj`
- **DB URL**: postgresql://postgres:***@db.lcsbcruorskqflcwlvgj.supabase.co:5432/postgres
- **SUPABASE_URL**: https://lcsbcruorskqflcwlvgj.supabase.co
- **Impact**: Task 1.2 now targets remote Supabase, local is optional for dev
- **Note**: Password contains `^` which needs URL encoding as `%5E`

## 2026-02-14: Supabase Connection Details (CONFIRMED WORKING)
- **Pooler (session, port 5432)**: postgresql://postgres.lcsbcruorskqflcwlvgj:[PW]@aws-1-us-east-1.pooler.supabase.com:5432/postgres
- **Pooler (transaction, port 6543)**: postgresql://postgres.lcsbcruorskqflcwlvgj:[PW]@aws-1-us-east-1.pooler.supabase.com:6543/postgres
- **Direct DB (IPv6 ONLY, unreachable from dev machine)**: postgresql://postgres:[PW]@db.lcsbcruorskqflcwlvgj.supabase.co:5432/postgres
- **SUPABASE_URL**: https://lcsbcruorskqflcwlvgj.supabase.co
- **PostgreSQL version**: 17.6
- **Note**: `aws-1` NOT `aws-0` for this project
- **Password**: contains `^` — must URL-encode as `%5E` in connection strings
- **For Drizzle**: Use session mode pooler (port 5432) for migrations, transaction mode (port 6543) for runtime
