import { desc } from 'drizzle-orm';

import { db } from '../lib/db';
import { user } from '../lib/db/schema';

async function main() {
  const users = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      githubUsername: user.githubUsername,
      role: user.role,
      createdAt: user.createdAt
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(20);

  if (users.length === 0) {
    return;
  }

  for (const u of users) {
    const _email = u.email.padEnd(34);
    const _name = (u.name || '-').padEnd(19);
    const _role = u.role.padEnd(7);
    const _github = u.githubUsername || '-';
  }
}

main().catch((_error: unknown) => {
  process.exit(1);
});
