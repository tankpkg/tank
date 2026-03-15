---
module: home-landing
status: REVIEWED
created: 2026-03-14
issue: https://github.com/tankpkg/tank/issues/79
---

# Home Landing Page

**Anchor**: The landing page is the primary conversion surface for unauthenticated visitors. It must render consistently — server-side and client-side — with no visible content flash or button replacement after hydration.

## Structure

```
packages/web/app/
  page.tsx              # Server component — home page layout
  home-auth-cta.tsx     # Client component — auth-conditional CTA buttons
```

```
HomeNavAuthCta          # Navbar CTA: "Sign In" / "Dashboard" + "Get Started" / "Open Dashboard"
HomePrimaryAuthCta      # Hero CTA: "Get Started" / "Open Dashboard"
```

## Constraints

| #   | Constraint                                                                                                  | Rationale                                          |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| C1  | Unauthenticated visitors MUST see "Get Started" on initial render AND after hydration                       | Conversion — no flash of wrong content             |
| C2  | Authenticated users MUST see "Open Dashboard" after hydration                                               | Correct UX for returning users                     |
| C3  | During session loading (indeterminate state), buttons MUST show the unauthenticated variant ("Get Started") | Prevents flash; safe default for public page       |
| C4  | No hydration mismatch warnings in the browser console                                                       | SSR and client render must agree on initial output |
| C5  | The fix MUST NOT change the auth system or suppress hydration warnings with hacks                           | Minimal, targeted fix only                         |

## Examples

| Visitor state   | Server render | After hydration | Expected button                              |
| --------------- | ------------- | --------------- | -------------------------------------------- |
| Not logged in   | "Get Started" | session=null    | "Get Started" (stable)                       |
| Logged in       | "Get Started" | session={user}  | "Open Dashboard" (after hydration, no flash) |
| Session loading | "Get Started" | pending         | "Get Started" (stable during load)           |

## Root Cause (Issue #79)

`useSession()` from `better-auth/react` initialises with `data: undefined` (loading state).
`isLoggedIn = Boolean(undefined?.user?.id)` → `false` → renders "Get Started".
After hydration, `useSession` resolves → if authenticated, re-renders to "Open Dashboard".
This causes a visible button flash for logged-in users.

## Fix Strategy

Use `isPending` / loading state from `useSession` to suppress the auth-conditional render
until the session is known. During loading, render the unauthenticated variant ("Get Started").
This matches the SSR output (which also has no session) and eliminates the hydration mismatch.

```
useSession() → { data, isPending }
if isPending → render unauthenticated variant (matches SSR)
if !isPending && data?.user → render authenticated variant
if !isPending && !data?.user → render unauthenticated variant
```
