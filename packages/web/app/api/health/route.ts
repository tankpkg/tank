import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { createSession, deleteSession, getSession } from '@/lib/cli-auth-store';
import { db } from '@/lib/db';
import { getStorageProvider } from '@/lib/storage/provider';

type HealthCheckResult = {
  status: 'healthy' | 'unhealthy';
  latency?: number;
  error?: string;
};

type HealthStatus = {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
    storage: HealthCheckResult;
    scanner: HealthCheckResult;
  };
};

async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'healthy', latency: Date.now() - start };
  } catch (error) {
    return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function checkRedis(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const sessionCode = await createSession('health-check-state');
    const session = await getSession(sessionCode);
    await deleteSession(sessionCode);

    if (session?.status === 'pending') {
      return { status: 'healthy', latency: Date.now() - start };
    }
    return { status: 'unhealthy', error: 'Session test failed' };
  } catch (error) {
    return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function checkStorage(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const storage = getStorageProvider();
    const bucket = process.env.S3_BUCKET || 'packages';
    if ('listObjects' in storage && typeof storage.listObjects === 'function') {
      await (storage as any).listObjects(bucket, '', 1);
    }
    return { status: 'healthy', latency: Date.now() - start };
  } catch (error) {
    return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function checkScanner(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const scannerUrl = process.env.PYTHON_API_URL || 'http://localhost:8000';
    const response = await fetch(`${scannerUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      return { status: 'healthy', latency: Date.now() - start };
    }
    return { status: 'unhealthy', error: `Scanner returned ${response.status}` };
  } catch (error) {
    return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function GET() {
  const checks = await Promise.all([checkDatabase(), checkRedis(), checkStorage(), checkScanner()]);

  const [database, redis, storage, scanner] = checks;

  const allChecks = { database, redis, storage, scanner };
  const healthyCount = Object.values(allChecks).filter((c) => c.status === 'healthy').length;
  const unhealthyCount = Object.values(allChecks).filter((c) => c.status === 'unhealthy').length;

  let status: 'ok' | 'degraded' | 'error';
  if (unhealthyCount === 0) {
    status = 'ok';
  } else if (healthyCount >= 2) {
    status = 'degraded';
  } else {
    status = 'error';
  }

  const response: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    checks: allChecks
  };

  const httpStatus = status === 'error' ? 503 : 200;
  return NextResponse.json(response, { status: httpStatus });
}
