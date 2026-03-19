import { createServerFn } from '@tanstack/react-start';
import { count } from 'drizzle-orm';

import { db } from '~/lib/db';
import { auditEvents, skills, user } from '~/lib/db/schema';

export const getAdminStatsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const [[users], [pkgs], [events]] = await Promise.all([
    db.select({ count: count() }).from(user),
    db.select({ count: count() }).from(skills),
    db.select({ count: count() }).from(auditEvents)
  ]);
  return {
    userCount: users?.count ?? 0,
    skillCount: pkgs?.count ?? 0,
    auditEventCount: events?.count ?? 0
  };
});
