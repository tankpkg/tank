# Intent: Fix Three Scan-Related Bugs

## Problem

Three bugs block core scanning workflows:

1. **detect-secrets import failure** -- Stage 4 secrets scanning silently degrades to a "low" finding. The `detect-secrets` library fails to import inside the Docker container. Custom patterns still run, but comprehensive secret detection (AWS keys, JWTs, private keys) is lost. Users see `detect_secrets_unavailable` in findings instead of real secrets.

2. **GitHub tarball 404 for non-main branches** -- Scanning repos with `master` as default branch (e.g., `contextLabs/context7-docs`) fails because `url-expander.ts` hardcodes `/tar.gz/main` in four locations. The scan returns an ingest failure instead of findings.

3. **Broken links on scan pages** -- User reports "all links seem to be broken" when viewing scan results. Root cause: Bug 2 causes scan failures for repos with non-main default branches, which means no results render and therefore no links work. The scan page shows "Package download failed" instead of findings with navigable CWE links.

## Success Criteria

1. detect-secrets runs and reports real findings in Docker container (no `detect_secrets_unavailable` finding)
2. Scanning `https://github.com/contextLabs/context7-docs` succeeds (resolves `master` as default branch)
3. Scanning any GitHub repo resolves the correct default branch automatically
4. CWE links in findings table navigate to correct MITRE pages
5. All external links on scan results page are functional

## Size Limits (existing, not changing)

| Limit                 | Value | Scope                                                |
| --------------------- | ----- | ---------------------------------------------------- |
| MAX_TARBALL_SIZE      | 50 MB | Compressed tarball (checked via HEAD Content-Length) |
| MAX_EXTRACTED_SIZE    | 50 MB | Total extracted content on disk                      |
| MAX_COMPRESSION_RATIO | 100x  | Zip bomb detection                                   |
| Individual file       | 5 MB  | Per-file inside tarball                              |
| Download timeout      | 30s   | HTTP timeout                                         |

For oversized repos: the `sub_path` mechanism (`narrow_to_sub_path()`) extracts only the relevant subdirectory, reducing effective size.

## Constraints

- C1: GitHub API calls must be cached (10-min TTL) to avoid rate limits (60 req/hr for anonymous)
- C2: Docker image size must not increase significantly
- C3: Fallback chain for branch resolution: API -> HEAD probe -> hardcoded `main`
- C4: No breaking changes to API response shapes
- C5: detect-secrets fix must work in Docker container (verify in build context)
- C6: Keep existing size limits (50MB) — sufficient for the vast majority of skill repos

## Complexity: Medium

## Risk: Medium -- Bug 2 fix adds network call to critical scan path, mitigated by caching
