import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockCreateOrganization = vi.fn();
const mockListOrganizations = vi.fn();
const mockGetFullOrganization = vi.fn();
const mockCreateInvitation = vi.fn();
const mockRemoveMember = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      createOrganization: (...args: unknown[]) => mockCreateOrganization(...args),
      listOrganizations: (...args: unknown[]) => mockListOrganizations(...args),
      getFullOrganization: (...args: unknown[]) => mockGetFullOrganization(...args),
      createInvitation: (...args: unknown[]) => mockCreateInvitation(...args),
      removeMember: (...args: unknown[]) => mockRemoveMember(...args),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock postgres to prevent DB connection attempts
vi.mock('postgres', () => {
  const mockSql = Object.assign(vi.fn().mockReturnValue([{ ok: 1 }]), {
    end: vi.fn(),
    options: {
      parsers: {},
      serializers: {},
      transform: { undefined: undefined },
    },
    reserve: vi.fn(),
  });
  return { default: vi.fn(() => mockSql) };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockSession = {
  user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  session: { id: 'session-1' },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('org server actions', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCreateOrganization.mockReset();
    mockListOrganizations.mockReset();
    mockGetFullOrganization.mockReset();
    mockCreateInvitation.mockReset();
    mockRemoveMember.mockReset();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.BETTER_AUTH_SECRET = 'test-secret-for-unit-tests';
  });

  describe('validateOrgSlug', () => {
    it('accepts valid slugs', async () => {
      const { validateOrgSlug } = await import('../actions');
      expect(await validateOrgSlug('my-org')).toEqual({ valid: true });
      expect(await validateOrgSlug('a')).toEqual({ valid: true });
      expect(await validateOrgSlug('org-123')).toEqual({ valid: true });
      expect(await validateOrgSlug('a1b2c3')).toEqual({ valid: true });
    });

    it('rejects empty slug', async () => {
      const { validateOrgSlug } = await import('../actions');
      expect(await validateOrgSlug('')).toEqual({ valid: false, error: 'Slug is required' });
    });

    it('rejects slugs longer than 39 characters', async () => {
      const { validateOrgSlug } = await import('../actions');
      const longSlug = 'a'.repeat(40);
      const result = await validateOrgSlug(longSlug);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('39');
    });

    it('rejects slugs with spaces', async () => {
      const { validateOrgSlug } = await import('../actions');
      expect((await validateOrgSlug('my org')).valid).toBe(false);
    });

    it('rejects slugs with special characters', async () => {
      const { validateOrgSlug } = await import('../actions');
      expect((await validateOrgSlug('my_org')).valid).toBe(false);
      expect((await validateOrgSlug('my.org')).valid).toBe(false);
      expect((await validateOrgSlug('MY-ORG')).valid).toBe(false);
    });

    it('rejects slugs starting or ending with hyphen', async () => {
      const { validateOrgSlug } = await import('../actions');
      expect((await validateOrgSlug('-my-org')).valid).toBe(false);
      expect((await validateOrgSlug('my-org-')).valid).toBe(false);
    });
  });

  describe('createOrg', () => {
    it('normalizes slug to lowercase and creates org', async () => {
      mockGetSession.mockResolvedValue(mockSession);
      mockCreateOrganization.mockResolvedValue({
        id: 'org-1',
        name: 'My Org',
        slug: 'my-org',
        createdAt: new Date(),
      });

      const { createOrg } = await import('../actions');
      const result = await createOrg({ name: 'My Org', slug: 'MY-ORG' });

      expect(result).toBeDefined();
      expect(mockCreateOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            name: 'My Org',
            slug: 'my-org',
          }),
        })
      );
    });

    it('rejects invalid slugs', async () => {
      mockGetSession.mockResolvedValue(mockSession);

      const { createOrg } = await import('../actions');
      await expect(createOrg({ name: 'Bad', slug: 'has spaces' })).rejects.toThrow();
    });

    it('rejects slugs over 39 chars', async () => {
      mockGetSession.mockResolvedValue(mockSession);

      const { createOrg } = await import('../actions');
      await expect(createOrg({ name: 'Long', slug: 'a'.repeat(40) })).rejects.toThrow('39');
    });

    it('throws when user is not authenticated', async () => {
      mockGetSession.mockResolvedValue(null);

      const { createOrg } = await import('../actions');
      await expect(createOrg({ name: 'Test', slug: 'test' })).rejects.toThrow('Unauthorized');
    });
  });

  describe('listOrgs', () => {
    it('returns list of organizations', async () => {
      mockGetSession.mockResolvedValue(mockSession);
      const mockOrgs = [
        { id: 'org-1', name: 'Org 1', slug: 'org-1', createdAt: new Date() },
        { id: 'org-2', name: 'Org 2', slug: 'org-2', createdAt: new Date() },
      ];
      mockListOrganizations.mockResolvedValue(mockOrgs);

      const { listOrgs } = await import('../actions');
      const result = await listOrgs();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('throws when user is not authenticated', async () => {
      mockGetSession.mockResolvedValue(null);

      const { listOrgs } = await import('../actions');
      await expect(listOrgs()).rejects.toThrow('Unauthorized');
    });
  });

  describe('inviteMember', () => {
    it('calls createInvitation with correct parameters', async () => {
      mockGetSession.mockResolvedValue(mockSession);
      mockCreateInvitation.mockResolvedValue({ id: 'inv-1', status: 'pending' });

      const { inviteMember } = await import('../actions');
      const result = await inviteMember({
        organizationId: 'org-1',
        email: 'new@example.com',
        role: 'member',
      });

      expect(result).toBeDefined();
      expect(mockCreateInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            email: 'new@example.com',
            role: 'member',
            organizationId: 'org-1',
          },
        })
      );
    });

    it('throws when user is not authenticated', async () => {
      mockGetSession.mockResolvedValue(null);

      const { inviteMember } = await import('../actions');
      await expect(
        inviteMember({ organizationId: 'org-1', email: 'test@test.com', role: 'member' })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('removeMember', () => {
    it('calls removeMember with correct parameters', async () => {
      mockGetSession.mockResolvedValue(mockSession);
      mockRemoveMember.mockResolvedValue({ success: true });

      const { removeMember } = await import('../actions');
      const result = await removeMember({
        organizationId: 'org-1',
        memberIdOrEmail: 'member-1',
      });

      expect(result).toEqual({ success: true });
      expect(mockRemoveMember).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            memberIdOrEmail: 'member-1',
            organizationId: 'org-1',
          },
        })
      );
    });

    it('throws when user is not authenticated', async () => {
      mockGetSession.mockResolvedValue(null);

      const { removeMember } = await import('../actions');
      await expect(
        removeMember({ organizationId: 'org-1', memberIdOrEmail: 'member-1' })
      ).rejects.toThrow('Unauthorized');
    });
  });
});
