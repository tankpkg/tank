import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '~/consts/env';

const supabaseUrl = env.SUPABASE_URL;
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin: SupabaseClient =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    : (new Proxy({} as SupabaseClient, {
        get() {
          throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable');
        }
      }) as SupabaseClient);
