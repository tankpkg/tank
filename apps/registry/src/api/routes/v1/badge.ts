import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '~/lib/db';
import { skills } from '~/lib/db/schema';

function scoreColor(score: number): string {
  if (score >= 8) return '#4c1';
  if (score >= 6) return '#dfb317';
  if (score >= 4) return '#fe7d37';
  return '#e05d44';
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

export const badgeRoutes = new Hono().get('/:name{.+}', async (c) => {
  const rawName = c.req.param('name');
  const name = decodeURIComponent(rawName);

  const rows = await db.execute(sql`
    SELECT sv.audit_score AS "auditScore"
    FROM ${skills} s
    INNER JOIN skill_versions sv ON sv.skill_id = s.id
    WHERE s.name = ${name}
    ORDER BY sv.created_at DESC
    LIMIT 1
  `);

  c.header('Cache-Control', 'public, max-age=300');
  c.header('Content-Type', 'image/svg+xml');

  if (rows.length === 0 || (rows[0] as Record<string, unknown>).auditScore == null) {
    return c.body(renderBadge('tank', 'not found', '#999'));
  }

  const score = Number((rows[0] as Record<string, unknown>).auditScore);
  const color = scoreColor(score);
  return c.body(renderBadge('tank', `${score.toFixed(1)}/10`, color));
});
