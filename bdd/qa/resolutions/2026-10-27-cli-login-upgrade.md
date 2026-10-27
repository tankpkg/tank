# Resolution: CLI login and cross-filesystem upgrades

**Date:** 2026-10-27

## Causes and changes

- Login session creation failed because production Redis was unreachable; the start endpoint incorrectly reported every failure as an invalid request. Server failures now return a sanitized 500, while malformed input remains a 400.
- Upgrades renamed a download from the system temporary directory over the installed binary. On different filesystems this fails with `EXDEV`. POSIX upgrades now stage and verify the download beside the installed executable before an atomic replacement.
- The PostgreSQL fallback now resets an expired rate-limit counter when starting a new window.
- TanStack Start was updated to versions patched for CVE-2026-102989, which blocked Vercel's production rebuild.

## Verification

- A real cross-filesystem regression reproduced `EXDEV` before the fix and passed after it, including a running compiled CLI.
- An isolated full login with a real CLI, production registry build and PostgreSQL issued a usable token. An independent headless browser clicked Authorize and exchanged another session for a usable token. A failing store returned 500 rather than 400.
- Production-render checks caught an incompatible TanStack SSR integration returning 500 on every page; aligned SSR/query dependencies now render the public and login pages.
- Real PostgreSQL tests covered expired counters and concurrent increments.
- A dependency-version guard checks that the resolved server-function packages meet the security advisory's patched minimums; it is not an exploit test.

Production also requires the replacement Redis configuration to be loaded by a successful deployment. Existing deployed functions retain their previous environment until then.
