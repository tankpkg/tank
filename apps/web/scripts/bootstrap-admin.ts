import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { auditEvents, user } from '../lib/db/schema';

async function main() {
  // Support both command-line argument and env variable
  // Usage: pnpm admin:bootstrap --email=user@example.com
  const args = process.argv.slice(2);
  const emailArg = args.find((arg) => arg.startsWith('--email='));
  const email = (emailArg?.split('=')[1] || process.env.FIRST_ADMIN_EMAIL)?.trim().toLowerCase();

  if (!email) {
    console.error('Error: Email is required.');
    console.error('');
    console.error('Usage:');
    console.error('  pnpm admin:bootstrap --email=your-email@example.com');
    console.error('');
    console.error('Or set FIRST_ADMIN_EMAIL in your .env.local file and run:');
    console.error('  pnpm admin:bootstrap');
    process.exit(1);
  }

  const [existingUser] = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!existingUser) {
    console.error(`Error: User with email '${email}' was not found.`);
    console.error('');
    console.error('Make sure you have logged in at least once with GitHub.');
    process.exit(1);
  }

  if (existingUser.role === 'admin') {
    console.log(`✓ User ${email} is already an admin.`);
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

  console.log(`✓ Promoted ${email} to admin.`);
  console.log('');
  console.log('You can now access the admin panel at: /admin');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
