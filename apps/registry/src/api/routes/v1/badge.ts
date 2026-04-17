import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';

import { db } from '~/lib/db';
import { skills } from '~/lib/db/schema';

function verdictColor(verdict: string | null): string {
  if (!verdict) return '#999';
  if (verdict === 'pass') return '#4c1';
  if (verdict === 'pass_with_notes') return '#dfb317';
  if (verdict === 'flagged') return '#fe7d37';
  if (verdict === 'fail') return '#e05d44';
  return '#999';
}

function verdictLabel(verdict: string | null): string {
  if (!verdict) return 'pending';
  return verdict.replace(/_/g, ' ').toUpperCase();
}

function renderBadge(label: string, value: string, color: string): string {
  const labelWidth = label.length * 6.5 + 10;
  const valueWidth = value.length * 6.5 + 10;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="a">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#a)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#b)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

function vulnCountColor(count: number): string {
  if (count === 0) return '#4c1';
  if (count <= 2) return '#dfb317';
  return '#fe7d37';
}

const badgeRoute = createRoute({
  method: 'get',
  path: '/{name}',
  tags: ['Badges'],
  summary: 'Get audit score badge',
  description: 'Returns an SVG badge showing the audit score for a package.',
  request: {
    params: z.object({
      name: z.string().openapi({ description: 'Package name (URL-encoded)', example: '@org/my-skill' })
    })
  },
  responses: {
    200: {
      description: 'SVG badge image',
      content: {
        'image/svg+xml': {
          schema: z.string()
        }
      }
    }
  }
});

export const badgeRoutes = new OpenAPIHono().openapi(badgeRoute, async (c) => {
  const { name: rawName } = c.req.valid('param');
  const name = decodeURIComponent(rawName);
  const badgeType = c.req.query('type');

  c.header('Cache-Control', 'public, max-age=300');
  c.header('Content-Type', 'image/svg+xml');

  // Dependency vulnerability badge: ?type=deps
  if (badgeType === 'deps') {
    try {
      const rows = await db.execute(sql`
        SELECT da.vulnerable_count AS "vulnerableCount",
               da.vuln_summary AS "vulnSummary"
        FROM ${skills} s
        INNER JOIN skill_versions sv ON sv.skill_id = s.id
        LEFT JOIN dep_audit_results da ON da.version_id = sv.id
        WHERE s.name = ${name}
        ORDER BY sv.created_at DESC, da.created_at DESC
        LIMIT 1
      `);

      if (rows.length === 0 || (rows[0] as Record<string, unknown>).vulnerableCount === null) {
        return c.body(renderBadge('deps', 'not found', '#999'));
      }

      const row = rows[0] as Record<string, unknown>;
      const count = Number(row.vulnerableCount) || 0;
      const vulnSummary = row.vulnSummary as { critical?: number } | null;
      const hasCritical = (vulnSummary?.critical ?? 0) > 0;
      const color = hasCritical ? '#e05d44' : vulnCountColor(count);
      const label = `${count} ${count === 1 ? 'vuln' : 'vulns'}`;
      return c.body(renderBadge('deps', label, color));
    } catch {
      return c.body(renderBadge('deps', 'error', '#999'));
    }
  }

  // Default: security verdict badge (backward compatible)
  try {
    const rows = await db.execute(sql`
      SELECT sr.verdict
      FROM ${skills} s
      INNER JOIN skill_versions sv ON sv.skill_id = s.id
      LEFT JOIN scan_results sr ON sr.version_id = sv.id
      WHERE s.name = ${name}
      ORDER BY sv.created_at DESC, sr.created_at DESC
      LIMIT 1
    `);

    if (rows.length === 0) {
      return c.body(renderBadge('tank', 'not found', '#999'));
    }

    const verdict = (rows[0] as Record<string, unknown>).verdict as string | null;
    const color = verdictColor(verdict);
    return c.body(renderBadge('tank', verdictLabel(verdict), color));
  } catch {
    return c.body(renderBadge('tank', 'error', '#999'));
  }
});
