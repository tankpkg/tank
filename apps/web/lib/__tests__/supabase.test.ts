import { describe, it, expect, beforeAll } from 'vitest';

// Set env vars before importing the module (it validates on load)
beforeAll(() => {
  process.env.SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

describe('Supabase client', () => {
  it('creates supabaseAdmin without errors', async () => {
    const { supabaseAdmin } = await import('../supabase');
    expect(supabaseAdmin).toBeDefined();
    expect(supabaseAdmin.storage).toBeDefined();
  });

  it('supabaseAdmin has storage methods for bucket operations', async () => {
    const { supabaseAdmin } = await import('../supabase');
    expect(supabaseAdmin.storage.from).toBeTypeOf('function');
    expect(supabaseAdmin.storage.listBuckets).toBeTypeOf('function');
    expect(supabaseAdmin.storage.createBucket).toBeTypeOf('function');
  });
});
