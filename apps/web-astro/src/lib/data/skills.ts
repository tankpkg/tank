import { count, eq } from 'drizzle-orm';

import { db } from '~/lib/db';
import { skills } from '~/lib/db/schema';

export async function getPublicSkillCount(): Promise<number> {
  try {
    const [row] = await db.select({ count: count() }).from(skills).where(eq(skills.visibility, 'public'));
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}
