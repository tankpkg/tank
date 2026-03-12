import { describe, it, expect } from 'vitest';
import {
  computeTrustLevel,
  getTrustBadgeConfig,
  getTrustBadgeApiConfig,
  getTrustLevelOrder,
  type TrustLevel
} from '../trust-level';

describe('computeTrustLevel', () => {
  it('returns pending for null verdict', () => {
    expect(computeTrustLevel(null, 0, 0, 0, 0)).toBe('pending');
  });

  it('returns unsafe for fail verdict', () => {
    expect(computeTrustLevel('fail', 0, 0, 0, 0)).toBe('unsafe');
  });

  it('returns concerns for flagged verdict', () => {
    expect(computeTrustLevel('flagged', 0, 0, 0, 0)).toBe('concerns');
  });

  it('returns review_recommended for pass_with_notes verdict', () => {
    expect(computeTrustLevel('pass_with_notes', 0, 0, 0, 0)).toBe('review_recommended');
  });

  it('returns verified for pass with 0 findings', () => {
    expect(computeTrustLevel('pass', 0, 0, 0, 0)).toBe('verified');
  });

  it('returns review_recommended for pass with findings (C1)', () => {
    // C1: Only PASS+0 = verified
    expect(computeTrustLevel('pass', 1, 0, 0, 0)).toBe('review_recommended');
    expect(computeTrustLevel('pass', 0, 1, 0, 0)).toBe('review_recommended');
    expect(computeTrustLevel('pass', 0, 0, 1, 0)).toBe('review_recommended');
    expect(computeTrustLevel('pass', 0, 0, 0, 1)).toBe('review_recommended');
  });

  it('handles unknown verdicts gracefully', () => {
    // Unknown verdicts should fall through to pending-like behavior
    expect(computeTrustLevel('unknown', 0, 0, 0, 0)).toBe('pending');
  });
});

describe('getTrustBadgeConfig', () => {
  it('returns correct config for verified', () => {
    const config = getTrustBadgeConfig('verified');
    expect(config.label).toBe('Verified');
    expect(config.color).toBe('#4c1');
    expect(config.icon).toBe('shield-check');
  });

  it('returns correct config for review_recommended', () => {
    const config = getTrustBadgeConfig('review_recommended');
    expect(config.label).toBe('Review Recommended');
    expect(config.color).toBe('#dfb317');
  });

  it('returns correct config for concerns', () => {
    const config = getTrustBadgeConfig('concerns');
    expect(config.label).toBe('Concerns');
    expect(config.color).toBe('#e05d44');
  });

  it('returns correct config for unsafe', () => {
    const config = getTrustBadgeConfig('unsafe');
    expect(config.label).toBe('Unsafe');
    expect(config.color).toBe('#e05d44');
  });

  it('returns correct config for pending', () => {
    const config = getTrustBadgeConfig('pending');
    expect(config.label).toBe('Pending');
    expect(config.color).toBe('#9f9f9f');
  });

  it('includes Tailwind classes for all levels', () => {
    const levels: TrustLevel[] = ['verified', 'review_recommended', 'concerns', 'unsafe', 'pending'];
    for (const level of levels) {
      const config = getTrustBadgeConfig(level);
      expect(config.bgClass).toContain('bg-');
      expect(config.textClass).toContain('text-');
    }
  });
});

describe('getTrustBadgeApiConfig', () => {
  it('returns verified for pass verdict', () => {
    const result = getTrustBadgeApiConfig('pass', 0);
    expect(result.value).toBe('verified');
    expect(result.color).toBe('#4c1');
  });

  it('returns notes count for review_recommended', () => {
    const result = getTrustBadgeApiConfig('pass_with_notes', 3);
    expect(result.value).toBe('3 notes');
    expect(result.color).toBe('#dfb317');
  });

  it('returns pending for null verdict', () => {
    const result = getTrustBadgeApiConfig(null, 0);
    expect(result.value).toBe('pending');
    expect(result.color).toBe('#9f9f9f');
  });
});

describe('getTrustLevelOrder', () => {
  it('orders verified highest', () => {
    expect(getTrustLevelOrder('verified')).toBeGreaterThan(getTrustLevelOrder('review_recommended'));
  });

  it('orders pending lowest', () => {
    expect(getTrustLevelOrder('pending')).toBe(0);
  });

  it('orders unsafe above pending but below concerns', () => {
    expect(getTrustLevelOrder('unsafe')).toBeLessThan(getTrustLevelOrder('concerns'));
    expect(getTrustLevelOrder('unsafe')).toBeGreaterThan(getTrustLevelOrder('pending'));
  });
});
