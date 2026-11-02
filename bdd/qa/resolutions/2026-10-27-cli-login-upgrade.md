# Resolution: CLI login and cross-filesystem upgrades

**Date:** 2026-10-27

## Causes and changes

- Login session creation failed because production Redis was unreachable; the start endpoint incorrectly reported every failure as an invalid request. Server failures now return a sanitized 500, while malformed input remains a 400.
- Upgrades renamed a download from the system temporary directory over the installed binary. On different filesystems this fails with `EXDEV`. POSIX upgrades now stage and verify the download beside the installed executable before an atomic replacement.
- The PostgreSQL fallback now resets expired rate-limit counters using the database clock, including after lock contention or a conflicting insert rolls back.
- When TLS is enabled, the PostgreSQL login store now verifies the server certificate and the actual DNS or IP host, honors `PGSSLMODE`, and requires PostgreSQL ALPN for direct TLS. The user chose to reject plaintext fallback even for `sslmode=prefer`; installations using an untrusted CA or a non-TLS server need a configuration change before upgrading.
- Redis rate counters now set expiry atomically with the first increment and, when expiry is permitted, repair previously persistent counters. A lost reply can conservatively count an increment twice but no longer creates a permanent counter.
- CLI session authorization and consumption now use atomic comparisons so concurrent requests on a consistent store primary cannot resurrect or consume a session twice, or complete after the session's five-minute deadline while waiting for the store. The user elected to retain Redis despite the risk that failover to a stale replica restores a consumed session and permits a second token.
- The user chose to keep equivalent duplicate API keys usable despite ambiguous historical usage: independently consumed duplicate rows can permit requests beyond their configured rate or finite-use limits. No duplicate hashes were observed in the read-only production preflight; other installations may differ.
- TanStack Start was updated to versions patched for CVE-2026-102989, which blocked Vercel's production rebuild.

## Verification

- A real cross-filesystem regression reproduced `EXDEV` before the fix and passed after it, including a running compiled CLI.
- An isolated full login with a real CLI, production registry build and PostgreSQL used a headless browser to click Authorize and issued a usable token. A failing store returned 500 rather than 400.
- The `v0.16.3` CLI login implementation is identical to the current source, so its start and exchange request contract remains covered by that flow; the published 0.16.3 binary was not run through the full login E2E.
- Production-render checks caught an incompatible TanStack SSR integration returning 500 on every page; aligned SSR/query dependencies now render the public and login pages.
- Real PostgreSQL, Redis and in-memory tests covered concurrent session authorization and consumption; PostgreSQL tests covered expired counters and concurrent increments.
- The published Linux 0.16.3 binary reproduced the upgrade failure and successfully upgraded to 0.16.5 when its temporary directory was on the installation filesystem. This proves the workaround, not that 0.16.5 contains the fix; the getting-started guide documents both points.
- A dependency-version guard checks that the resolved server-function packages meet the security advisory's patched minimums; it is not an exploit test.

Production also requires the replacement Redis configuration to be loaded by a successful deployment. Existing deployed functions retain their previous environment until then. New sessions use a separate namespace so old replicas cannot resurrect them. Stop routing CLI auth requests to old instances and drain their in-flight requests before routing to new instances: old replicas can still process legacy sessions, and mixed routing can interrupt login. The approved cutover invalidates in-progress CLI login sessions created before the change; affected users must start login again. Unambiguous saved API tokens remain usable; tokens with conflicting, deleted, or unverifiable owners are rejected. For non-default reference-only keys with unverifiable ownership, users must create replacements and an administrator must resolve the old rows.
