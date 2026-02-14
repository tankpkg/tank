import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    'Missing SUPABASE_SERVICE_ROLE_KEY environment variable',
  );
}

/**
 * Supabase client using the ANON (publishable) key.
 * Safe for client-side use — respects Row Level Security.
 * Use for public operations and authenticated user requests.
 */
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Supabase admin client using the SERVICE_ROLE key.
 * Server-side only — bypasses Row Level Security.
 * Use for admin operations: storage management, background jobs, migrations.
 *
 * NEVER expose this client or its key to the browser.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
