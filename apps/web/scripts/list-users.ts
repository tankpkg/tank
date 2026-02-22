import { db } from '../lib/db';
import { user } from '../lib/db/schema';
import { desc } from 'drizzle-orm';

async function main() {
  const users = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      githubUsername: user.githubUsername,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(20);

  if (users.length === 0) {
    console.log('No users found. Log in with GitHub first.');
    return;
  }

  console.log(`\nFound ${users.length} user(s):\n`);
  console.log('Email'.padEnd(35) + 'Name'.padEnd(20) + 'Role'.padEnd(8) + 'GitHub');
  console.log('-'.repeat(90));

  for (const u of users) {
    const email = u.email.padEnd(34);
    const name = (u.name || '-').padEnd(19);
    const role = u.role.padEnd(7);
    const github = u.githubUsername || '-';
    console.log(`${email} ${name} ${role} ${github}`);
  }

  console.log('');
  console.log('To promote a user to admin:');
  console.log('  pnpm admin:bootstrap --email=user@example.com');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
