import { describe, it, expect, beforeAll } from 'vitest';

// Set env vars before importing the module (it validates on load)
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

describe('Supabase client', () => {
  it('creates supabaseClient without errors', async () => {
    const { supabaseClient } = await import('../supabase');
    expect(supabaseClient).toBeDefined();
    expect(supabaseClient.storage).toBeDefined();
    expect(supabaseClient.from).toBeTypeOf('function');
  });

  it('creates supabaseAdmin without errors', async () => {
    const { supabaseAdmin } = await import('../supabase');
    expect(supabaseAdmin).toBeDefined();
    expect(supabaseAdmin.storage).toBeDefined();
    expect(supabaseAdmin.from).toBeTypeOf('function');
  });

  it('supabaseClient and supabaseAdmin are different instances', async () => {
    const { supabaseClient, supabaseAdmin } = await import('../supabase');
    expect(supabaseClient).not.toBe(supabaseAdmin);
  });
});
