# API Bypass Prevention

## What

Ensure private skill access controls cannot be bypassed through direct API calls or URL manipulation.

## Why

Security boundary enforcement — private skills must remain private regardless of access vector.

## Acceptance Criteria

- [ ] Direct API calls to private skill endpoints return 403 without auth
- [ ] Tarball download URLs require valid authentication
