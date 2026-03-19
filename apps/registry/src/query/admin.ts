import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { sql } from 'drizzle-orm';
import { isAdmin } from '~/lib/auth/authz';
import { auth } from '~/lib/auth/core';
import { db } from '~/lib/db';

export const getAdminStatsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error('Unauthorized');
  if (!(await isAdmin(session.user.id))) throw new Error('Forbidden');

  const [[usersRow], [skillsRow], [auditRow]] = await Promise.all([
    db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "user"`),
    db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM skills`),
    db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM audit_events`)
  ]);

  return {
    users: usersRow?.count ?? 0,
    skills: skillsRow?.count ?? 0,
    auditEvents: auditRow?.count ?? 0
  };
});
