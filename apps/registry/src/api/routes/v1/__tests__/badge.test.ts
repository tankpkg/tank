import { describe, expect, it } from 'vitest';

// Extracted pure logic from badge.ts for unit testing
// The route handler itself requires DB mocking; the pure functions
// cover the core badge rendering logic.

function vulnCountColor(count: number): string {
  if (count === 0) return '#4c1';
  if (count <= 2) return '#dfb317';
  return '#fe7d37';
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

describe('vulnCountColor (deps badge logic)', () => {
  it('returns green for zero vulnerabilities', () => {
    expect(vulnCountColor(0)).toBe('#4c1');
  });

  it('returns yellow for 1-2 vulnerabilities', () => {
    expect(vulnCountColor(1)).toBe('#dfb317');
    expect(vulnCountColor(2)).toBe('#dfb317');
  });

  it('returns orange for 3+ vulnerabilities', () => {
    expect(vulnCountColor(3)).toBe('#fe7d37');
    expect(vulnCountColor(10)).toBe('#fe7d37');
  });
});

describe('renderBadge (SVG generation)', () => {
  it('renders deps badge with vulnerability count', () => {
    const svg = renderBadge('deps', '0 vulns', '#4c1');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('>deps</text>');
    expect(svg).toContain('>0 vulns</text>');
    expect(svg).toContain('fill="#4c1"');
  });

  it('renders deps badge with critical color override', () => {
    const svg = renderBadge('deps', '5 vulns', '#e05d44');
    expect(svg).toContain('fill="#e05d44"');
  });

  it('renders not-found badge in grey', () => {
    const svg = renderBadge('deps', 'not found', '#999');
    expect(svg).toContain('fill="#999"');
    expect(svg).toContain('>not found</text>');
  });

  it('renders singular vuln label', () => {
    const svg = renderBadge('deps', '1 vuln', '#dfb317');
    expect(svg).toContain('>1 vuln</text>');
  });
});
