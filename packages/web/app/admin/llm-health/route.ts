import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

/**
 * Health check for LLM providers status
 * Shows whether LLM analysis is enabled and provider health
 */
export async function GET() {
  // Verify admin session
  const sessionData = await auth.api.getSession({
    headers: await headers()
  });

  if (!sessionData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin role
  const dbUser = await db.select({ role: user.role }).from(user).where(eq(user.id, sessionData.user.id)).limit(1);

  if (dbUser.length === 0 || dbUser[0].role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get Python API URL
  const pythonApiUrl = (process.env.PYTHON_API_URL || '').trim();
  const scanApiUrl =
    pythonApiUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:8000');

  try {
    // Call Python API health endpoint
    const response = await fetch(`${scanApiUrl}/api/health/llm`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to check LLM health', details: await response.text() },
        { status: 500 }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      llm_scan_enabled: data.llm_scan_enabled ?? false,
      mode: data.mode ?? 'disabled',
      providers: data.providers ?? []
    });
  } catch (error) {
    console.error('[LLM Health] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check LLM health', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
