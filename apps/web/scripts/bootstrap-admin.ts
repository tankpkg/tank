import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditEvents, user } from '@/lib/db/schema';

async function main() {
  const email = process.env.FIRST_ADMIN_EMAIL?.trim().toLowerCase();

  if (!email) {
    throw new Error('FIRST_ADMIN_EMAIL is required.');
  }

  const [existingUser] = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!existingUser) {
    throw new Error(`User with email '${email}' was not found.`);
  }

  if (existingUser.role === 'admin') {
    console.log(`User ${email} is already an admin.`);
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
      source: 'scripts/bootstrap-admin.ts',
    },
  });

  console.log(`Promoted ${email} to admin.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
