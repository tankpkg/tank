import { NextResponse } from 'next/server';
import { resolveRequestUserId } from '@/lib/auth-helpers';
import { searchSkills } from '@/lib/data/skills';

export async function GET(request: Request) {
  const requesterUserId = await resolveRequestUserId(request);
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));

  const data = await searchSkills(q, page, limit, requesterUserId);

  return NextResponse.json(data);
}
