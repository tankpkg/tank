import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../lib/logger.js';

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('info() calls console.log with blue icon', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('hello');
    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0].join(' ');
    expect(output).toContain('hello');
    expect(output).toContain('ℹ');
  });

  it('success() calls console.log with green icon', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.success('done');
    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0].join(' ');
    expect(output).toContain('done');
    expect(output).toContain('✓');
  });

  it('warn() calls console.log with yellow icon', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.warn('careful');
    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0].join(' ');
    expect(output).toContain('careful');
    expect(output).toContain('⚠');
  });

  it('error() calls console.error with red icon', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('failed');
    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0].join(' ');
    expect(output).toContain('failed');
    expect(output).toContain('✗');
  });
});
