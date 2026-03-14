import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Tank — Security-first package manager for AI agent skills';
export const size = {
  width: 1200,
  height: 630
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'system-ui, sans-serif',
        padding: '72px 80px'
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '12px',
            backgroundColor: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px'
          }}>
          🛡️
        </div>
        <span style={{ fontSize: '36px', fontWeight: 'bold', letterSpacing: '-0.5px' }}>Tank</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div
          style={{
            fontSize: '56px',
            fontWeight: 'bold',
            lineHeight: 1.1,
            letterSpacing: '-1px',
            maxWidth: '900px'
          }}>
          Security-first package manager for AI agent skills
        </div>
        <div style={{ fontSize: '26px', color: '#94a3b8', maxWidth: '800px', lineHeight: 1.4 }}>
          Publish, install, and audit AI skills with integrity verification, permission budgets, and 6-stage security
          scanning.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div
            style={{
              padding: '10px 22px',
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              fontSize: '18px',
              border: '1px solid #334155'
            }}>
            📦 Install
          </div>
          <div
            style={{
              padding: '10px 22px',
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              fontSize: '18px',
              border: '1px solid #334155'
            }}>
            🔒 Verify
          </div>
          <div
            style={{
              padding: '10px 22px',
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              fontSize: '18px',
              border: '1px solid #334155'
            }}>
            🚀 Publish
          </div>
          <div
            style={{
              padding: '10px 22px',
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              fontSize: '18px',
              border: '1px solid #334155'
            }}>
            🔍 Audit
          </div>
        </div>
        <div style={{ fontSize: '20px', color: '#475569' }}>tankpkg.dev</div>
      </div>
    </div>,
    {
      ...size
    }
  );
}
