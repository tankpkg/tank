import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { verifyCliAuth } from '~/lib/auth/authz';
import { db } from '~/lib/db';
import { user } from '~/lib/db/auth-schema';

export const authRoutes = new Hono().get('/whoami', async (c) => {
  const verified = await verifyCliAuth(c.req.raw);
  if (!verified) {
    return c.json({ error: 'Unauthorized. Valid API key required.' }, 401);
  }

  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, verified.userId))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  const row = rows[0];
  return c.json({ userId: row.id, name: row.name, email: row.email });
});
