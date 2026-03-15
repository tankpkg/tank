import { createFileRoute } from '@tanstack/react-router';
import satori from 'satori';
import type { ReactNode } from 'react';

const fontPromise = fetch('https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-400-normal.woff')
  .then((r) => r.arrayBuffer())
  .catch(() => new ArrayBuffer(0));

export const Route = createFileRoute('/og.png')({
  server: {
    handlers: {
      GET: async () => {
        const font = await fontPromise;
        const fonts =
          font.byteLength > 0 ? [{ name: 'Geist', data: font, weight: 400 as const, style: 'normal' as const }] : [];

        const svg = await satori(
          {
            type: 'div',
            props: {
              style: {
                height: '100%',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                fontFamily: 'Geist, sans-serif',
                padding: '72px 80px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '16px' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            width: '56px',
                            height: '56px',
                            borderRadius: '12px',
                            backgroundColor: '#10b981',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '28px',
                            fontWeight: 'bold',
                          },
                          children: 'T',
                        },
                      },
                      {
                        type: 'span',
                        props: {
                          style: { fontSize: '36px', fontWeight: 'bold', letterSpacing: '-0.5px' },
                          children: 'Tank',
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'column', gap: '20px' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: '56px',
                            fontWeight: 'bold',
                            lineHeight: 1.1,
                            letterSpacing: '-1px',
                            maxWidth: '900px',
                          },
                          children: 'Security-first package manager for AI agent skills',
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { fontSize: '26px', color: '#94a3b8', maxWidth: '800px', lineHeight: 1.4 },
                          children:
                            'Publish, install, and audit AI skills with integrity verification, permission budgets, and 6-stage security scanning.',
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', gap: '16px' },
                          children: ['Install', 'Verify', 'Publish', 'Audit'].map((label) => ({
                            type: 'div',
                            props: {
                              style: {
                                padding: '10px 22px',
                                backgroundColor: '#1e293b',
                                borderRadius: '8px',
                                fontSize: '18px',
                                border: '1px solid #334155',
                              },
                              children: label,
                            },
                          })),
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { fontSize: '20px', color: '#475569' },
                          children: 'tankpkg.dev',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          } as unknown as ReactNode,
          { width: 1200, height: 630, fonts }
        );

        return new Response(svg, {
          headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
          },
        });
      },
    },
  },
});
