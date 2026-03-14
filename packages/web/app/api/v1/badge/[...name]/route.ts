import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { skills } from '@/lib/db/schema';

const LABEL = 'tank';
const FONT_FAMILY = 'DejaVu Sans,Verdana,Geneva,sans-serif';
const FONT_SIZE = 11;
const HEIGHT = 20;
const PADDING = 6;
const LABEL_COLOR = '#555';

/** ~6.5px per character at 11px DejaVu Sans — standard shields.io approximation. */
function textWidth(text: string): number {
  return Math.ceil(text.length * 6.5) + PADDING * 2;
}

function scoreColor(score: number | null): string {
  if (score === null) return '#9f9f9f';
  if (score >= 8) return '#4c1';
  if (score >= 5) return '#dfb317';
  return '#e05d44';
}

function scoreText(score: number | null): string {
  if (score === null) return 'unscored';
  return `${score}/10`;
}

function renderBadge(label: string, value: string, valueColor: string): string {
  const labelWidth = textWidth(label);
  const valueWidth = textWidth(value);
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${HEIGHT}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${HEIGHT}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${HEIGHT}" fill="${LABEL_COLOR}"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${HEIGHT}" fill="${valueColor}"/>
    <rect width="${totalWidth}" height="${HEIGHT}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string[] }> }) {
  const { name: nameParts } = await params;
  const name = nameParts.map((p) => decodeURIComponent(p)).join('/');

  const headers = {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=300'
  };

  const results = await db.execute(sql`
    SELECT
      sv.audit_score AS "auditScore"
    FROM ${skills} s
    LEFT JOIN skill_versions sv ON sv.skill_id = s.id
      AND sv.created_at = (
        SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = s.id
      )
    WHERE s.name = ${name}
    LIMIT 1
  `);

  if (results.length === 0) {
    const svg = renderBadge(LABEL, 'not found', '#9f9f9f');
    return new Response(svg, { status: 404, headers });
  }

  const row = results[0] as Record<string, unknown>;
  const auditScore = row.auditScore as number | null;

  const svg = renderBadge(LABEL, scoreText(auditScore), scoreColor(auditScore));
  return new Response(svg, { status: 200, headers });
}
