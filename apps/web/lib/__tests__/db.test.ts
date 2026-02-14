import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the postgres module with a realistic enough client shape
// that Drizzle's constructor doesn't blow up.
vi.mock('postgres', () => {
  const mockSql = Object.assign(
    vi.fn().mockReturnValue([{ ok: 1 }]),
    {
      end: vi.fn(),
      options: {
        parsers: {},
        serializers: {},
        transform: { undefined: undefined },
      },
      reserve: vi.fn(),
    },
  );
  return { default: vi.fn(() => mockSql) };
});

describe('db module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws if DATABASE_URL is missing', async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    await expect(import('../db')).rejects.toThrow(
      'Missing DATABASE_URL environment variable',
    );

    process.env.DATABASE_URL = original;
  });

  it('exports db and sql when DATABASE_URL is set', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

    const { db, sql } = await import('../db');

    expect(db).toBeDefined();
    expect(sql).toBeDefined();
  });

  it('db has query methods', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

    const { db } = await import('../db');

    // Drizzle instance should have select, insert, update, delete
    expect(db.select).toBeTypeOf('function');
    expect(db.insert).toBeTypeOf('function');
    expect(db.update).toBeTypeOf('function');
    expect(db.delete).toBeTypeOf('function');
  });
});
