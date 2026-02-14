import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl && process.env.NODE_ENV !== 'production') {
  console.warn('Missing SUPABASE_URL environment variable');
}

if (!supabaseServiceRoleKey && process.env.NODE_ENV !== 'production') {
  console.warn('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}

/**
 * Supabase admin client — used for Storage operations ONLY.
 *
 * We do NOT use Supabase Auth (we use better-auth instead).
 * This client uses the service role key to bypass RLS for
 * managing the `packages` storage bucket.
 *
 * NEVER expose this client or its key to the browser.
 *
 * Uses lazy initialization (Proxy) to avoid throwing during
 * Next.js build when env vars are not available.
 */
export const supabaseAdmin: SupabaseClient =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : (new Proxy({} as SupabaseClient, {
        get() {
          throw new Error(
            'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable',
          );
        },
      }) as SupabaseClient);
