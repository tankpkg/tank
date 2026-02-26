import { ImageResponse } from 'next/og';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { skills } from '@/lib/db/schema';

export const runtime = 'edge';
export const alt = 'Tank Skill';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function scoreColor(score: number | null): string {
  if (score === null) return '#64748b';
  if (score >= 8) return '#22c55e';
  if (score >= 5) return '#eab308';
  return '#ef4444';
}

function scoreLabel(score: number | null): string {
  if (score === null) return 'Unscored';
  return `${score}/10`;
}

export default async function Image({ params }: { params: Promise<{ name: string[] }> }) {
  const { name: nameParts } = await params;
  const skillName = decodeURIComponent(nameParts.join('/'));

  let description = 'AI agent skill on Tank';
  let version: string | null = null;
  let auditScore: number | null = null;
  let publisher = '';

  try {
    const rows = await db.execute(sql`
      SELECT
        s.description,
        sv.version,
        sv.audit_score AS "auditScore",
        coalesce(u.name, '') AS "publisherName"
      FROM ${skills} s
      LEFT JOIN "user" u ON u.id = s.publisher_id
      LEFT JOIN skill_versions sv ON sv.skill_id = s.id
        AND sv.created_at = (
          SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = s.id
        )
      WHERE s.name = ${skillName} AND s.visibility = 'public'
      LIMIT 1
    `) as Record<string, unknown>[];

    if (rows.length > 0) {
      const row = rows[0];
      if (row.description) description = String(row.description);
      if (row.version) version = String(row.version);
      if (row.auditScore != null) auditScore = Number(row.auditScore);
      if (row.publisherName) publisher = String(row.publisherName);
    }
  } catch {
    // Fall through with defaults — OG image should never fail
  }

  const color = scoreColor(auditScore);
  const truncatedDesc = description.length > 120
    ? description.slice(0, 117) + '...'
    : description;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          fontFamily: 'system-ui, sans-serif',
          padding: '60px',
        }}
      >
        {/* Top: Tank branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            🛡️
          </div>
          <span style={{ fontSize: '20px', color: '#94a3b8' }}>Tank Registry</span>
        </div>

        {/* Middle: Skill info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '48px', fontWeight: 'bold', lineHeight: 1.1 }}>
            {skillName}
          </div>
          {version && (
            <div style={{ fontSize: '24px', color: '#94a3b8' }}>
              v{version}
              {publisher ? ` · ${publisher}` : ''}
            </div>
          )}
          <div style={{ fontSize: '22px', color: '#cbd5e1', lineHeight: 1.4 }}>
            {truncatedDesc}
          </div>
        </div>

        {/* Bottom: Audit score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 20px',
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              border: `2px solid ${color}`,
            }}
          >
            <div style={{ fontSize: '18px', color: '#94a3b8' }}>Audit Score</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color }}>
              {scoreLabel(auditScore)}
            </div>
          </div>
          <div style={{ fontSize: '16px', color: '#64748b' }}>
            tankpkg.dev
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
