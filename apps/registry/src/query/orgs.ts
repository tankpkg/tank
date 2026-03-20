import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

import { auth } from '~/lib/auth/core';

async function requireHeaders() {
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error('Unauthorized');
  return headers;
}

export const listOrgsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = await requireHeaders();
  return auth.api.listOrganizations({ headers });
});

export const createOrgFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { name: string; slug: string }) => input)
  .handler(async ({ data }) => {
    const headers = await requireHeaders();
    return auth.api.createOrganization({ headers, body: data });
  });

export const getOrgFn = createServerFn({ method: 'GET' })
  .inputValidator((input: string) => input)
  .handler(async ({ data: slug }) => {
    const headers = await requireHeaders();
    return auth.api.getFullOrganization({ headers, query: { organizationSlug: slug } });
  });

export const inviteMemberFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; email: string; role: 'member' | 'admin' | 'owner' }) => input)
  .handler(async ({ data }) => {
    const headers = await requireHeaders();
    return auth.api.createInvitation({ headers, body: data });
  });

export const removeMemberFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; memberIdOrEmail: string }) => input)
  .handler(async ({ data }) => {
    const headers = await requireHeaders();
    return auth.api.removeMember({ headers, body: data });
  });

export const acceptInvitationFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { invitationId: string }) => input)
  .handler(async ({ data }) => {
    const headers = await requireHeaders();
    return auth.api.acceptInvitation({ headers, body: { invitationId: data.invitationId } });
  });
