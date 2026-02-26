import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { getSkillDetail } from '@/lib/data/skills';

export const dynamic = 'force-dynamic';

const size = { width: 1200, height: 630 };

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string[] }> },
) {
  const { name: nameParts } = await params;
  const skillName = decodeURIComponent(nameParts.join('/'));

  let description = 'AI agent skill on Tank';
  let version: string | null = null;
  let auditScore: number | null = null;
  let publisher = '';

  try {
    const data = await getSkillDetail(skillName);
    if (data) {
      if (data.description) description = data.description;
      if (data.latestVersion?.version) version = data.latestVersion.version;
      if (data.latestVersion?.auditScore != null) auditScore = data.latestVersion.auditScore;
      if (data.publisher.name) publisher = data.publisher.name;
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
