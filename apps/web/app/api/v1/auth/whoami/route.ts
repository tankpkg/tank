import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { verifyCliAuth } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { user } from '@/lib/db/auth-schema';

export async function GET(request: Request) {
  const verified = await verifyCliAuth(request);
  if (!verified) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const users = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, verified.userId))
    .limit(1);

  if (users.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    name: users[0].name,
    email: users[0].email,
    userId: verified.userId,
  });
}
