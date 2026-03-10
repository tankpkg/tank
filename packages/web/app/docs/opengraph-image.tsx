import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Tank Documentation';
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
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'system-ui, sans-serif'
      }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '32px'
        }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '12px',
            backgroundColor: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px'
          }}>
          🛡️
        </div>
        <span style={{ fontSize: '48px', fontWeight: 'bold' }}>Tank</span>
      </div>
      <div style={{ fontSize: '24px', color: '#94a3b8' }}>Security-First Package Manager for AI Skills</div>
      <div
        style={{
          marginTop: '48px',
          display: 'flex',
          gap: '24px'
        }}>
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: '#1e293b',
            borderRadius: '8px',
            fontSize: '16px'
          }}>
          📦 Install
        </div>
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: '#1e293b',
            borderRadius: '8px',
            fontSize: '16px'
          }}>
          🔒 Verify
        </div>
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: '#1e293b',
            borderRadius: '8px',
            fontSize: '16px'
          }}>
          🚀 Publish
        </div>
      </div>
    </div>,
    {
      ...size
    }
  );
}
