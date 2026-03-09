# Official Playwright References - Sources

This document lists all official sources used to create the reference materials.

## Official Playwright Documentation

All content is sourced from **Playwright v1.58.2** official documentation (February 2026).

### Core Documentation Pages

1. **Authentication** (`playwright-web.md#authentication-setup`)
   - Source: https://playwright.dev/docs/auth
   - Covers: storageState, shared accounts, worker-scoped auth, API auth, multiple roles
   - Key patterns: Setup project, worker fixtures, session storage

2. **Locators** (`playwright-web.md#stable-selectors`)
   - Source: https://playwright.dev/docs/locators
   - Covers: getByRole, getByLabel, getByText, getByTestId, filtering, chaining
   - Key patterns: Priority order, custom test IDs, strictness

3. **Fixtures** (`playwright-web.md#test-fixtures`)
   - Source: https://playwright.dev/docs/test-fixtures
   - Covers: Built-in fixtures, custom fixtures, worker-scoped, automatic fixtures
   - Key patterns: Fixture composition, execution order, timeout configuration

4. **CI Integration** (`playwright-web.md#ci-configuration`)
   - Source: https://playwright.dev/docs/ci
   - Covers: GitHub Actions, Docker, sharding, parallelization
   - Key patterns: Sequential on CI, trace on retry, blob reporter for sharding

5. **Best Practices** (`playwright-web.md#best-practices`)
   - Source: https://playwright.dev/docs/best-practices
   - Covers: Test philosophy, isolation, web-first assertions, tooling
   - Key patterns: User-visible behavior, avoid third-party deps, parallelism

## Search Results Summary

### Authentication Patterns
- **storageState** feature for session reuse
- Dedicated setup scripts (`auth.setup.ts`)
- Environment variable best practices
- Role-based authentication states
- Token expiry handling
- API authentication for faster setup

### Selector Best Practices
- **getByRole** prioritized for accessibility
- **data-testid** as stable fallback
- Centralized test ID management
- Hybrid approach (role + testid)
- Avoid brittle CSS/XPath selectors
- Custom attribute configuration

### CI/CD Patterns
- **Sharding** with GitHub Actions matrix
- Blob reporter for distributed tests
- Report merging workflow
- Docker containerization
- Parallel execution strategies
- Fail-fast with `--only-changed`

### Fixture Patterns
- Worker-scoped for expensive setup
- Test-scoped for isolation
- Automatic fixtures for global hooks
- Fixture composition and dependencies
- Database connection management
- API-based setup for speed

### Page Object Model
- Single responsibility per page object
- Assertions in tests, not page objects
- Descriptive locators (getBy methods)
- Reusable methods
- Custom fixtures for injection
- TypeScript for type safety

## Community Best Practices

### From Search Results (Verified Against Official Docs)

1. **BrowserStack** - Authentication best practices
   - Secure credential handling
   - Exclude storageState from version control
   - Dedicated test users
   - Regular state regeneration

2. **Checkly** - Authentication patterns
   - Setup project dependencies
   - Storage state reuse
   - API-first authentication

3. **Medium/Dev.to** - Fixture patterns
   - Worker-scoped database connections
   - Global setup/teardown
   - Test isolation strategies

4. **GitHub Discussions** - CI optimization
   - Sharding strategies
   - Report merging
   - Docker best practices

## Key Takeaways

### Authentication
- ✅ Use `storageState` for session reuse
- ✅ Setup project for shared accounts
- ✅ Worker fixtures for parallel isolation
- ✅ API auth when possible (faster)
- ❌ Never commit auth files
- ❌ Never hardcode credentials

### Selectors
- ✅ Prioritize `getByRole` (accessibility)
- ✅ Use `getByLabel` for forms
- ✅ `data-testid` as fallback
- ✅ Chain and filter for specificity
- ❌ Avoid CSS classes/IDs
- ❌ Avoid XPath

### CI
- ✅ Sequential workers on CI (stability)
- ✅ Shard for parallelization
- ✅ Trace on first retry
- ✅ Docker for consistency
- ❌ Don't cache browser binaries
- ❌ Don't run full suite on every commit

### Fixtures
- ✅ Worker-scoped for expensive setup
- ✅ Test-scoped for isolation
- ✅ Automatic for global hooks
- ✅ Compose fixtures for modularity
- ❌ Don't share state between tests
- ❌ Don't use fixtures for assertions

## Verification

All patterns have been verified against:
- ✅ Playwright official documentation (v1.58.2)
- ✅ Official GitHub repository examples
- ✅ Microsoft Learn training modules
- ✅ Community best practices (cross-referenced)

## Updates

To update these references:
1. Check Playwright release notes: https://playwright.dev/docs/release-notes
2. Review updated documentation pages
3. Test patterns against latest version
4. Update version numbers in references

---

**Last Verified**: 2026-02-21  
**Playwright Version**: v1.58.2  
**Documentation Base**: https://playwright.dev/docs/intro
