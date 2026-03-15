# Anti-Patterns

Common mistakes that waste time or break core Tank guarantees.

## Universal

- Do not use Zod `parse()` where failures should be surfaced as normal control flow
- Do not import CLI, Web, and MCP packages into each other
- Do not hide bugfixes inside refactors
- Do not suppress types instead of fixing them
- Do not commit real env/config secrets

## Web

- Do not query application data through Supabase clients
- Do not put auth guards only in page components
- Do not edit `auth-schema.ts`
- Do not create new DB clients outside `lib/db.ts`
- Do not skip audit logging for admin actions

## CLI And MCP

- Do not hardcode registry URLs when config/shared constants exist
- Do not skip SHA-512 verification
- Do not extract archives without traversal/link checks
- Do not write tests against the real `~/.tank/` home directory

## Scanner

- Do not skip Stage 0
- Do not silently swallow stage failures
- Do not claim a finding came from a tool that did not actually run

## Shared

- Do not add side effects
- Do not rely on deep imports as the public contract
