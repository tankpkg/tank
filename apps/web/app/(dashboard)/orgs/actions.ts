'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MAX_SLUG_LENGTH = 39;

function validateSlug(slug: string): { valid: boolean; error?: string } {
  if (!slug) {
    return { valid: false, error: 'Slug is required' };
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    return { valid: false, error: `Slug must be ${MAX_SLUG_LENGTH} characters or fewer` };
  }
  if (!SLUG_REGEX.test(slug)) {
    return {
      valid: false,
      error: 'Slug must be lowercase alphanumeric with hyphens, cannot start or end with a hyphen',
    };
  }
  return { valid: true };
}

// Exported as async for 'use server' compatibility — wraps sync validation
export async function validateOrgSlug(slug: string): Promise<{ valid: boolean; error?: string }> {
  return validateSlug(slug);
}

export async function createOrg(data: { name: string; slug: string }) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const slug = data.slug.toLowerCase();
  const validation = validateSlug(slug);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const result = await auth.api.createOrganization({
    body: {
      name: data.name,
      slug,
    },
    headers: reqHeaders,
  });

  return result;
}

export async function listOrgs() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const orgs = await auth.api.listOrganizations({
    headers: reqHeaders,
  });

  return orgs;
}

export async function getOrgDetails(slug: string) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const org = await auth.api.getFullOrganization({
    query: {
      organizationSlug: slug,
    },
    headers: reqHeaders,
  });

  return org;
}

export async function inviteMember(data: { organizationId: string; email: string; role: 'member' }) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const result = await auth.api.createInvitation({
    body: {
      email: data.email,
      role: data.role,
      organizationId: data.organizationId,
    },
    headers: reqHeaders,
  });

  return result;
}

export async function removeMember(data: { organizationId: string; memberIdOrEmail: string }) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const result = await auth.api.removeMember({
    body: {
      memberIdOrEmail: data.memberIdOrEmail,
      organizationId: data.organizationId,
    },
    headers: reqHeaders,
  });

  return result;
}
