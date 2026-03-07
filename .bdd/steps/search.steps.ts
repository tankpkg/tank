/**
 * BDD step definitions for hybrid skill search.
 *
 * Intent: .idd/modules/search/INTENT.md
 * Feature: .bdd/features/search/search.feature
 *
 * Runs against REAL PostgreSQL — zero mocks.
 * Requires DATABASE_URL in .env.local.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

// ── World ──────────────────────────────────────────────────────────────────

interface SearchWorld {
  sql: postgres.Sql;
  org: string;
  insertedIds: string[];
  lastResults: Array<{ name: string; description: string | null; score: number }>;
}

const world: SearchWorld = {
  sql: null as unknown as postgres.Sql,
  org: `e2e-bdd-srch-${Date.now()}`,
  insertedIds: [],
  lastResults: [],
};

const SEED_SKILLS = [
  { suffix: 'react', desc: 'React patterns for production apps' },
  { suffix: 'react-hooks', desc: 'Custom React hooks collection' },
  { suffix: 'clean-code', desc: 'Code quality and refactoring patterns' },
  { suffix: 'seo-audit', desc: 'SEO audit and optimization tools' },
  { suffix: 'auth-patterns', desc: 'Authentication and authorization helpers' },
];

function skillName(suffix: string): string {
  return `@${world.org}/${suffix}`;
}

// ── Helpers (real SQL, no mocks) ───────────────────────────────────────────

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

async function hybridSearch(
  sql: postgres.Sql,
  q: string,
  limit = 20,
): Promise<Array<{ name: string; description: string | null; score: number }>> {
  const escaped = escapeLike(q);

  const rows = await sql`
    SELECT
      s.name,
      s.description,
      (
        CASE WHEN lower(s.name) = lower(${q}) THEN 1000 ELSE 0 END
        + CASE WHEN s.name ILIKE ${q + '%'} THEN 800 ELSE 0 END
        + CASE WHEN s.name ILIKE ${'%/' + escaped + '%'} THEN 600 ELSE 0 END
        + CASE WHEN s.name ILIKE ${'%' + escaped + '%'} THEN 400 ELSE 0 END
        + (greatest(similarity(s.name, ${q}), similarity(split_part(s.name, '/', 2), ${q})) * 300)::int
        + (ts_rank(
            to_tsvector('english', s.name || ' ' || coalesce(s.description, '')),
            plainto_tsquery('english', ${q})
          ) * 100)::int
      ) AS score
    FROM skills s
    WHERE (
      s.name ILIKE ${'%' + escaped + '%'}
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
    score: Number(r.score),
  }));
}

// ── Given ──────────────────────────────────────────────────────────────────

async function givenPublishedSkillsInTheRegistry(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required — set it in .env.local');
  world.sql = postgres(dbUrl);

  await world.sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  await world.sql`
    CREATE INDEX IF NOT EXISTS skills_name_trgm_idx
    ON skills USING gin (name gin_trgm_ops)
  `;

  const users = await world.sql`SELECT id FROM "user" LIMIT 1`;
  if (users.length === 0) {
    throw new Error('No users in database — need at least one to seed test skills');
  }
  const publisherId = users[0].id as string;

  for (const s of SEED_SKILLS) {
    const [row] = await world.sql`
      INSERT INTO skills (name, description, publisher_id, visibility, status)
      VALUES (${skillName(s.suffix)}, ${s.desc}, ${publisherId}, 'public', 'active')
      RETURNING id
    `;
    world.insertedIds.push(row.id as string);
  }
}

// ── When ───────────────────────────────────────────────────────────────────

async function whenISearchFor(query: string): Promise<void> {
  world.lastResults = await hybridSearch(world.sql, query);
}

// ── Then ───────────────────────────────────────────────────────────────────

function thenFirstResultIs(expectedName: string): void {
  expect(world.lastResults.length).toBeGreaterThanOrEqual(1);
  expect(world.lastResults[0].name).toBe(expectedName);
}

function thenResultsContain(expectedName: string): void {
  const names = world.lastResults.map((r) => r.name);
  expect(names).toContain(expectedName);
}

function thenResultsContainAllSeeded(): void {
  const names = world.lastResults.map((r) => r.name);
  for (const s of SEED_SKILLS) {
    expect(names).toContain(skillName(s.suffix));
  }
}

function thenFirstResultNameContains(substring: string): void {
  expect(world.lastResults.length).toBeGreaterThanOrEqual(1);
  expect(world.lastResults[0].name).toContain(substring);
}

function thenAtLeastOneResultNameContains(substring: string): void {
  const hasMatch = world.lastResults.some((r) => r.name.includes(substring));
  expect(hasMatch).toBe(true);
}

function thenRanksAbove(higherName: string, lowerName: string): void {
  const higherIdx = world.lastResults.findIndex((r) => r.name === higherName);
  const lowerIdx = world.lastResults.findIndex((r) => r.name === lowerName);
  if (lowerIdx >= 0) {
    expect(higherIdx).toBeLessThan(lowerIdx);
  }
}

function thenNoResultsMatchSeededOrg(): void {
  const ourResults = world.lastResults.filter((r) => r.name.startsWith(`@${world.org}/`));
  expect(ourResults.length).toBe(0);
}

// ── Cleanup ────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  if (world.insertedIds.length > 0) {
    await world.sql`DELETE FROM skills WHERE id = ANY(${world.insertedIds}::uuid[])`;
  }
  await world.sql.end();
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Skill discovery via hybrid search', () => {
  beforeAll(async () => {
    await givenPublishedSkillsInTheRegistry();
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  }, 15_000);

  // ── Exact & partial name matching ──────────────────────────────────

  describe('Scenario: Exact full name returns the skill as the top result (E1)', () => {
    it('runs Given/When/Then', async () => {
      await whenISearchFor(skillName('react'));
      thenFirstResultIs(skillName('react'));
    });
  });

  describe('Scenario: Partial name prefix matches multiple skills (E2)', () => {
    it('runs Given/When/Then', async () => {
      await whenISearchFor(`${world.org}/rea`);
      thenResultsContain(skillName('react'));
      thenResultsContain(skillName('react-hooks'));
    });
  });

  describe('Scenario: Skill-name part after slash matches directly (E6)', () => {
    it('runs Given/When/Then', async () => {
      await whenISearchFor('clean-code');
      thenFirstResultNameContains('clean-code');
    });
  });

  // ── Organization-scoped browsing ───────────────────────────────────

  describe('Scenario: Searching by org prefix returns all skills in that org (E3)', () => {
    it('runs Given/When/Then', async () => {
      await whenISearchFor(`@${world.org}`);
      thenResultsContainAllSeeded();
    });
  });

  // ── Typo tolerance ─────────────────────────────────────────────────

  describe('Scenario: Misspelled query finds the intended skill via trigram (E4)', () => {
    it('runs Given/When/Then', async () => {
      await whenISearchFor('recat');
      thenAtLeastOneResultNameContains('react');
    });
  });

  // ── Full-text search on description ────────────────────────────────

  describe('Scenario: Description keyword matches via full-text search (E5)', () => {
    it('runs Given/When/Then', async () => {
      await whenISearchFor('refactoring');
      thenAtLeastOneResultNameContains('clean-code');
    });
  });

  // ── Ranking order ──────────────────────────────────────────────────

  describe('Scenario: Exact name ranks above partial matches (E7)', () => {
    it('runs Given/When/Then', async () => {
      await whenISearchFor(skillName('react'));
      thenRanksAbove(skillName('react'), skillName('react-hooks'));
    });
  });

  describe('Scenario: Name-contains match ranks above description-only match (E8)', () => {
    it('runs Given/When/Then', async () => {
      await whenISearchFor('auth');
      thenFirstResultNameContains('auth');
    });
  });

  // ── Safety & edge cases ────────────────────────────────────────────

  describe('Scenario: Completely unrelated query returns no seeded results (E9)', () => {
    it('runs Given/When/Then', async () => {
      await whenISearchFor('zzzyyyxxx-nonexistent-42');
      thenNoResultsMatchSeededOrg();
    });
  });

  describe('Scenario: Special characters and SQL injection attempts are safe (E10)', () => {
    it('runs Given/When/Then', async () => {
      for (const q of ['@', '/', '%', '_', "'; DROP TABLE skills;--", '🚀']) {
        await whenISearchFor(q);
        expect(Array.isArray(world.lastResults)).toBe(true);
      }
    });
  });
});
