import { NextResponse } from 'next/server';
import { resolveRequestUserId } from '@/lib/auth-helpers';
import type { SortOption } from '@/lib/data/skills';
import { searchSkills } from '@/lib/data/skills';

const VALID_SORTS: SortOption[] = ['updated', 'downloads', 'stars', 'security', 'tokens', 'name'];

function parseSort(raw: string | null): SortOption {
  if (raw && VALID_SORTS.includes(raw as SortOption)) return raw as SortOption;
  return 'updated';
}

export async function GET(request: Request) {
  const requesterUserId = await resolveRequestUserId(request);
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
  const sort = parseSort(url.searchParams.get('sort'));

  const data = await searchSkills({
    q,
    page,
    limit,
    sort,
    visibility: 'all',
    scoreBucket: 'all',
    requesterUserId
  });

  return NextResponse.json(data);
}
