import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the db module — all vi.fn() must be inline (not top-level vars)
// because vi.mock factories are hoisted before variable initialization.
vi.mock('~/lib/db', () => ({
  db: {
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([{ id: 'test-id' }]) })
  }
}));

vi.mock('~/lib/db/schema', () => ({
  depAuditResults: {
    versionId: 'version_id'
  }
}));

// Mock the clients to return controlled data
vi.mock('../clients/npms-client', () => ({
  fetchNpmsScoresBatch: vi.fn().mockResolvedValue(new Map())
}));

vi.mock('../clients/osv-client', () => ({
  fetchOsvVulnerabilities: vi.fn().mockResolvedValue(new Map())
}));

vi.mock('../clients/npm-audit-client', () => ({
  fetchNpmAuditVulnerabilities: vi.fn().mockResolvedValue(new Map())
}));

// Import after mocks
import { DepAuditService } from '../service';

describe('DepAuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores clean report for manifest with no dependencies', async () => {
    const service = new DepAuditService();
    await service.runAudit('version-123', {});

    const { db } = await import('~/lib/db');
    expect(db.delete).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it('never throws — errors stored as failed status', async () => {
    const { db } = await import('~/lib/db');
    vi.mocked(db.delete).mockReturnValueOnce({ where: vi.fn().mockResolvedValue(undefined) } as never);
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn().mockRejectedValue(new Error('DB error'))
    } as never);

    const service = new DepAuditService();
    // Should not throw
    await expect(
      service.runAudit('version-123', {
        dependencies: { lodash: '^4.17.0' }
      })
    ).resolves.toBeUndefined();
  });

  it('fetches from all sources and stores result', async () => {
    const service = new DepAuditService();
    await service.runAudit('version-123', {
      dependencies: { lodash: '^4.17.21' }
    });

    const { db } = await import('~/lib/db');
    expect(db.delete).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it('replaces existing audit data on rescan (delete-before-insert)', async () => {
    const { db } = await import('~/lib/db');
    const deleteFn = vi.mocked(db.delete);
    const insertFn = vi.mocked(db.insert);

    const service = new DepAuditService();

    // First audit — stores initial data
    await service.runAudit('version-rescan', {
      dependencies: { express: '^4.18.0' }
    });

    const firstDeleteCall = deleteFn.mock.calls.length;
    const firstInsertCall = insertFn.mock.calls.length;

    // Second audit (rescan) — should delete old row and insert new
    await service.runAudit('version-rescan', {
      dependencies: { express: '^4.19.0' }
    });

    // delete and insert each called once more for the rescan
    expect(deleteFn.mock.calls.length).toBe(firstDeleteCall + 1);
    expect(insertFn.mock.calls.length).toBe(firstInsertCall + 1);
  });
});
