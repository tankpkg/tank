import fs from 'node:fs';
import path from 'node:path';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ORG = `e2e-srch-${Date.now()}`;
const SEARCH_TEST_USER_ID = `e2e-search-user-${ORG}`;

const SEED_SKILLS = [
  { suffix: 'react', desc: 'React patterns for production apps' },
  { suffix: 'react-hooks', desc: 'Custom React hooks collection' },
  { suffix: 'clean-code', desc: 'Code quality and refactoring patterns' },
  { suffix: 'seo-audit', desc: 'SEO audit and optimization tools' },
  { suffix: 'auth-patterns', desc: 'Authentication and authorization helpers' }
];

function skillName(suffix: string) {
  return `@${ORG}/${suffix}`;
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

async function hybridSearch(
  sql: postgres.Sql,
  q: string,
  limit = 20
): Promise<Array<{ name: string; description: string | null; score: number }>> {
  const escaped = escapeLike(q);

  const rows = (await sql`
    SELECT
      s.name,
      s.description,
      (
        CASE WHEN lower(s.name) = lower(${q}) THEN 1000 ELSE 0 END
        + CASE WHEN s.name ILIKE ${`${q}%`} THEN 800 ELSE 0 END
        + CASE WHEN s.name ILIKE ${`%/${escaped}%`} THEN 600 ELSE 0 END
        + CASE WHEN s.name ILIKE ${`%${escaped}%`} THEN 400 ELSE 0 END
        + (greatest(similarity(s.name, ${q}), similarity(split_part(s.name, '/', 2), ${q})) * 300)::int
        + (ts_rank(
            to_tsvector('english', s.name || ' ' || coalesce(s.description, '')),
            plainto_tsquery('english', ${q})
          ) * 100)::int
      ) AS score
    FROM skills s
    WHERE (
      s.name ILIKE ${`%${escaped}%`}
      OR similarity(s.name, ${q}) > 0.15
      OR similarity(split_part(s.name, '/', 2), ${q}) > 0.15
      OR to_tsvector('english', s.name || ' ' || coalesce(s.description, ''))
         @@ plainto_tsquery('english', ${q})
    )
    AND s.visibility = 'public'
    ORDER BY score DESC, s.updated_at DESC
    LIMIT ${limit}
  `) as Array<{ name: string; description: string | null; score: number | string }>;

  return rows.map((r) => ({
    name: r.name,
    description: r.description,
    score: Number(r.score)
  }));
}

describe('Hybrid search (real DB)', () => {
  let sql: postgres.Sql | undefined;
  const insertedIds: string[] = [];

  const getSql = (): postgres.Sql => {
    if (!sql) {
      throw new Error('Search test database client was not initialized');
    }
    return sql;
  };

  const getDatabaseUrl = () => {
    if (process.env.DATABASE_URL) {
      return process.env.DATABASE_URL;
    }

    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      return undefined;
    }

    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator <= 0) continue;
      if (trimmed.slice(0, separator).trim() !== 'DATABASE_URL') continue;
      const value = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      process.env.DATABASE_URL = value;
      return value;
    }

    return undefined;
  };

  beforeAll(async () => {
    const dbUrl = getDatabaseUrl();
    if (!dbUrl) throw new Error('DATABASE_URL required — set it in .env');
    sql = postgres(dbUrl);

    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await sql`
      CREATE INDEX IF NOT EXISTS skills_name_trgm_idx
      ON skills USING gin (name gin_trgm_ops)
    `;

    const now = new Date();
    await sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${SEARCH_TEST_USER_ID}, ${'E2E Search User'}, ${`${ORG}@tank.test`}, true, ${now}, ${now})
    `;

    for (const s of SEED_SKILLS) {
      const [row] = await sql`
        INSERT INTO skills (name, description, publisher_id, visibility, status)
        VALUES (${skillName(s.suffix)}, ${s.desc}, ${SEARCH_TEST_USER_ID}, 'public', 'active')
        RETURNING id
      `;
      insertedIds.push(row.id as string);
    }
  }, 30_000);

  afterAll(async () => {
    if (!sql) {
      return;
    }
    if (insertedIds.length > 0) {
      await sql`DELETE FROM skills WHERE id = ANY(${insertedIds}::uuid[])`;
    }
    await sql`DELETE FROM "user" WHERE id = ${SEARCH_TEST_USER_ID}`;
    await sql.end();
  }, 15_000);

  it('finds skill by exact full name', async () => {
    const results = await hybridSearch(getSql(), skillName('react'));
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe(skillName('react'));
  });

  it('finds skills by partial name prefix ("rea")', async () => {
    const results = await hybridSearch(getSql(), `${ORG}/rea`);
    const names = results.map((r) => r.name);
    expect(names).toContain(skillName('react'));
    expect(names).toContain(skillName('react-hooks'));
  });

  it('finds all skills in the org by searching "@org"', async () => {
    const results = await hybridSearch(getSql(), `@${ORG}`);
    const names = results.map((r) => r.name);
    for (const s of SEED_SKILLS) {
      expect(names).toContain(skillName(s.suffix));
    }
  });

  it('finds skills with a typo via trigram similarity ("recat")', async () => {
    const results = await hybridSearch(getSql(), 'recat');
    const hasReactMatch = results.some((r) => r.name.includes('react'));
    expect(hasReactMatch).toBe(true);
  });

  it('finds skills by description keyword via FTS ("refactoring")', async () => {
    const results = await hybridSearch(getSql(), 'refactoring');
    const hasCleanCode = results.some((r) => r.name.includes('clean-code'));
    expect(hasCleanCode).toBe(true);
  });

  it('finds skills by skill-name part after slash ("clean-code")', async () => {
    const results = await hybridSearch(getSql(), 'clean-code');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toContain('clean-code');
  });

  it('ranks exact name match above partial matches', async () => {
    const results = await hybridSearch(getSql(), skillName('react'));
    expect(results[0].name).toBe(skillName('react'));
    const reactIdx = results.findIndex((r) => r.name === skillName('react'));
    const hooksIdx = results.findIndex((r) => r.name === skillName('react-hooks'));
    if (hooksIdx >= 0) {
      expect(reactIdx).toBeLessThan(hooksIdx);
    }
  });

  it('ranks name-contains above description-only matches', async () => {
    const results = await hybridSearch(getSql(), 'auth');
    const authIdx = results.findIndex((r) => r.name.includes('auth'));
    expect(authIdx).toBe(0);
  });

  it('returns empty results for completely unrelated query', async () => {
    const results = await hybridSearch(getSql(), 'zzzyyyxxx-nonexistent-42');
    const ourResults = results.filter((r) => r.name.startsWith(`@${ORG}/`));
    expect(ourResults.length).toBe(0);
  });

  it('handles special characters in query without errors', async () => {
    for (const q of ['@', '/', '%', '_', "'; DROP TABLE skills;--", '🚀']) {
      const results = await hybridSearch(getSql(), q);
      expect(Array.isArray(results)).toBe(true);
    }
  });
});
