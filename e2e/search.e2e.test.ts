import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ORG = `e2e-srch-${Date.now()}`;

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

  const rows = await sql`
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
  `;

  return rows.map((r) => ({
    name: r.name as string,
    description: r.description as string | null,
    score: Number(r.score)
  }));
}

describe('Hybrid search (real DB)', () => {
  let sql: postgres.Sql;
  const insertedIds: string[] = [];

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL required — set it in .env.local');
    sql = postgres(dbUrl);

    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await sql`
      CREATE INDEX IF NOT EXISTS skills_name_trgm_idx
      ON skills USING gin (name gin_trgm_ops)
    `;

    const users = await sql`SELECT id FROM "user" LIMIT 1`;
    if (users.length === 0) {
      throw new Error('No users in database — need at least one to seed test skills');
    }
    const publisherId = users[0].id as string;

    for (const s of SEED_SKILLS) {
      const [row] = await sql`
        INSERT INTO skills (name, description, publisher_id, visibility, status)
        VALUES (${skillName(s.suffix)}, ${s.desc}, ${publisherId}, 'public', 'active')
        RETURNING id
      `;
      insertedIds.push(row.id as string);
    }
  }, 30_000);

  afterAll(async () => {
    if (insertedIds.length > 0) {
      await sql`DELETE FROM skills WHERE id = ANY(${insertedIds}::uuid[])`;
    }
    await sql.end();
  }, 15_000);

  it('finds skill by exact full name', async () => {
    const results = await hybridSearch(sql, skillName('react'));
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe(skillName('react'));
  });

  it('finds skills by partial name prefix ("rea")', async () => {
    const results = await hybridSearch(sql, `${ORG}/rea`);
    const names = results.map((r) => r.name);
    expect(names).toContain(skillName('react'));
    expect(names).toContain(skillName('react-hooks'));
  });

  it('finds all skills in the org by searching "@org"', async () => {
    const results = await hybridSearch(sql, `@${ORG}`);
    const names = results.map((r) => r.name);
    for (const s of SEED_SKILLS) {
      expect(names).toContain(skillName(s.suffix));
    }
  });

  it('finds skills with a typo via trigram similarity ("recat")', async () => {
    const results = await hybridSearch(sql, 'recat');
    const hasReactMatch = results.some((r) => r.name.includes('react'));
    expect(hasReactMatch).toBe(true);
  });

  it('finds skills by description keyword via FTS ("refactoring")', async () => {
    const results = await hybridSearch(sql, 'refactoring');
    const hasCleanCode = results.some((r) => r.name.includes('clean-code'));
    expect(hasCleanCode).toBe(true);
  });

  it('finds skills by skill-name part after slash ("clean-code")', async () => {
    const results = await hybridSearch(sql, 'clean-code');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toContain('clean-code');
  });

  it('ranks exact name match above partial matches', async () => {
    const results = await hybridSearch(sql, skillName('react'));
    expect(results[0].name).toBe(skillName('react'));
    const reactIdx = results.findIndex((r) => r.name === skillName('react'));
    const hooksIdx = results.findIndex((r) => r.name === skillName('react-hooks'));
    if (hooksIdx >= 0) {
      expect(reactIdx).toBeLessThan(hooksIdx);
    }
  });

  it('ranks name-contains above description-only matches', async () => {
    const results = await hybridSearch(sql, 'auth');
    const authIdx = results.findIndex((r) => r.name.includes('auth'));
    expect(authIdx).toBe(0);
  });

  it('returns empty results for completely unrelated query', async () => {
    const results = await hybridSearch(sql, 'zzzyyyxxx-nonexistent-42');
    const ourResults = results.filter((r) => r.name.startsWith(`@${ORG}/`));
    expect(ourResults.length).toBe(0);
  });

  it('handles special characters in query without errors', async () => {
    for (const q of ['@', '/', '%', '_', "'; DROP TABLE skills;--", '🚀']) {
      const results = await hybridSearch(sql, q);
      expect(Array.isArray(results)).toBe(true);
    }
  });
});
