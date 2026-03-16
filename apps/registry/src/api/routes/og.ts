import { Hono } from 'hono';
import type { ReactNode } from 'react';
import satori from 'satori';
import { getScoreColor } from '~/lib/score';
import { getSkillDetail } from '~/lib/skills/data';

const fontPromise = fetch('https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-400-normal.woff')
  .then((r) => r.arrayBuffer())
  .catch(() => new ArrayBuffer(0));

async function loadFonts() {
  const font = await fontPromise;
  return font.byteLength > 0 ? [{ name: 'Geist', data: font, weight: 400 as const, style: 'normal' as const }] : [];
}

function svgResponse(svg: string) {
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400'
    }
  });
}

export const ogRoutes = new Hono()

  .get('/', async () => {
    const fonts = await loadFonts();

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
            padding: '72px 80px'
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
                        fontWeight: 'bold'
                      },
                      children: 'T'
                    }
                  },
                  {
                    type: 'span',
                    props: {
                      style: { fontSize: '36px', fontWeight: 'bold', letterSpacing: '-0.5px' },
                      children: 'Tank'
                    }
                  }
                ]
              }
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
                        maxWidth: '900px'
                      },
                      children: 'Security-first package manager for AI agent skills'
                    }
                  },
                  {
                    type: 'div',
                    props: {
                      style: { fontSize: '26px', color: '#94a3b8', maxWidth: '800px', lineHeight: 1.4 },
                      children:
                        'Publish, install, and audit AI skills with integrity verification, permission budgets, and 6-stage security scanning.'
                    }
                  }
                ]
              }
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
                            border: '1px solid #334155'
                          },
                          children: label
                        }
                      }))
                    }
                  },
                  {
                    type: 'div',
                    props: {
                      style: { fontSize: '20px', color: '#475569' },
                      children: 'tankpkg.dev'
                    }
                  }
                ]
              }
            }
          ]
        }
      } as unknown as ReactNode,
      { width: 1200, height: 630, fonts }
    );

    return svgResponse(svg);
  })

  .get('/:name{.+}', async (c) => {
    const skillName = decodeURIComponent(c.req.param('name'));

    let description = 'AI agent skill on Tank';
    let version: string | null = null;
    let auditScore: number | null = null;
    let publisher = '';

    try {
      const data = await getSkillDetail(skillName, null);
      if (data) {
        if (data.description) description = data.description;
        if (data.latestVersion?.version) version = data.latestVersion.version;
        if (data.latestVersion?.auditScore != null) auditScore = data.latestVersion.auditScore;
        if (data.publisher.name) publisher = data.publisher.name;
      }
    } catch {}

    const color = getScoreColor(auditScore);
    const truncatedDesc = description.length > 120 ? `${description.slice(0, 117)}...` : description;
    const scoreLabel = auditScore !== null ? `${auditScore}/10` : 'Unscored';
    const fonts = await loadFonts();

    const svg = await satori(
      {
        type: 'div',
        props: {
          style: {
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            fontFamily: 'Geist, sans-serif',
            padding: '60px'
          },
          children: [
            {
              type: 'div',
              props: {
                style: { display: 'flex', alignItems: 'center', gap: '12px' },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        backgroundColor: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        fontWeight: 'bold'
                      },
                      children: 'T'
                    }
                  },
                  {
                    type: 'span',
                    props: {
                      style: { fontSize: '20px', color: '#94a3b8' },
                      children: 'Tank Registry'
                    }
                  }
                ]
              }
            },
            {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'column', gap: '16px' },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: { fontSize: '48px', fontWeight: 'bold', lineHeight: 1.1 },
                      children: skillName
                    }
                  },
                  ...(version
                    ? [
                        {
                          type: 'div',
                          props: { style: { fontSize: '24px', color: '#94a3b8' }, children: `v${version}` }
                        }
                      ]
                    : []),
                  {
                    type: 'div',
                    props: {
                      style: { fontSize: '22px', color: '#cbd5e1', maxWidth: '900px', lineHeight: 1.4 },
                      children: truncatedDesc
                    }
                  }
                ]
              }
            },
            {
              type: 'div',
              props: {
                style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', alignItems: 'center', gap: '24px' },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 16px',
                              backgroundColor: '#1e293b',
                              borderRadius: '8px',
                              border: `2px solid ${color}`
                            },
                            children: [
                              {
                                type: 'span',
                                props: { style: { fontSize: '18px', color }, children: `Security: ${scoreLabel}` }
                              }
                            ]
                          }
                        },
                        ...(publisher
                          ? [
                              {
                                type: 'span',
                                props: { style: { fontSize: '18px', color: '#94a3b8' }, children: `by ${publisher}` }
                              }
                            ]
                          : [])
                      ]
                    }
                  },
                  { type: 'div', props: { style: { fontSize: '20px', color: '#475569' }, children: 'tankpkg.dev' } }
                ]
              }
            }
          ]
        }
      } as unknown as ReactNode,
      { width: 1200, height: 630, fonts }
    );

    return svgResponse(svg);
  });
