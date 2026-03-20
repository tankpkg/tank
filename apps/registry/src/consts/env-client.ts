// ── Public client env (browser-safe, no process.env) ──
// Companion to env.ts — separated because env.ts runs safeParse(process.env)
// at module init which crashes in browser context.

export const clientEnv = {
  APP_URL:
    typeof window !== 'undefined'
      ? window.location.origin
      : import.meta.env.VITE_PUBLIC_APP_URL || 'http://localhost:5555'
} as const;
