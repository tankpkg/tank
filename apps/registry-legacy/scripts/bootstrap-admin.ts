import { eq } from 'drizzle-orm';

import { db } from '../lib/db';
import { auditEvents, user } from '../lib/db/schema';

async function main() {
  // Support both command-line argument and env variable
  // Usage: bun admin:bootstrap --email=user@example.com
  const args = process.argv.slice(2);
  const emailArg = args.find((arg) => arg.startsWith('--email='));
  const email = (emailArg?.split('=')[1] || process.env.FIRST_ADMIN_EMAIL)?.trim().toLowerCase();

  if (!email) {
    process.exit(1);
  }

  const [existingUser] = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!existingUser) {
    process.exit(1);
  }

  if (existingUser.role === 'admin') {
    return;
  }

  await db.update(user).set({ role: 'admin' }).where(eq(user.id, existingUser.id));

  await db.insert(auditEvents).values({
    action: 'user.promote',
    actorId: null,
    targetType: 'user',
    targetId: existingUser.id,
    metadata: {
      oldRole: existingUser.role,
      newRole: 'admin',
      bootstrap: true,
      source: 'scripts/bootstrap-admin.ts'
    }
  });
}

main().catch((_error: unknown) => {
  process.exit(1);
});
