import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { skills } from '@/lib/db/schema';
import { computeTrustLevel, getTrustBadgeConfig } from '@/lib/trust-level';

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

function renderBadge(label: string, value: string, valueColor: string, title?: string): string {
  const labelWidth = textWidth(label);
  const valueWidth = textWidth(value);
  const totalWidth = labelWidth + valueWidth;
  const titleTag = title ? `<title>${title}</title>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${HEIGHT}">
  ${titleTag}
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
      sv.audit_score AS "auditScore",
      sr.verdict,
      sr.critical_count AS "criticalCount",
      sr.high_count AS "highCount",
      sr.medium_count AS "mediumCount",
      sr.low_count AS "lowCount"
    FROM ${skills} s
    LEFT JOIN skill_versions sv ON sv.skill_id = s.id
      AND sv.created_at = (
        SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = s.id
      )
    LEFT JOIN scan_results sr ON sr.version_id = sv.id
      AND sr.created_at = (
        SELECT MAX(sr2.created_at) FROM scan_results sr2 WHERE sr2.version_id = sv.id
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
  const verdict = row.verdict as string | null;
  const criticalCount = Number(row.criticalCount) || 0;
  const highCount = Number(row.highCount) || 0;
  const mediumCount = Number(row.mediumCount) || 0;
  const lowCount = Number(row.lowCount) || 0;
  const totalFindings = criticalCount + highCount + mediumCount + lowCount;

  // Compute trust level
  const trustLevel = computeTrustLevel(verdict, criticalCount, highCount, mediumCount, lowCount);
  const config = getTrustBadgeConfig(trustLevel);

  // Determine badge value based on trust level
  let value: string;
  if (trustLevel === 'verified') {
    value = 'verified';
  } else if (trustLevel === 'review_recommended') {
    value = totalFindings > 0 ? `${totalFindings} notes` : 'review';
  } else {
    value = config.label.toLowerCase();
  }

  // Include score in title for backward compatibility
  const title = auditScore !== null ? `Security score: ${auditScore}/10` : undefined;

  const svg = renderBadge(LABEL, value, config.color, title);
  return new Response(svg, { status: 200, headers });
}
