import { redis } from '~/lib/redis';

const EMAIL_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const EMAIL_RATE_LIMIT_MAX = 3; // Max 3 emails per minute per address
const VERIFICATION_RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const VERIFICATION_RATE_LIMIT_MAX = 5; // Max 5 verification emails per hour per address

export async function checkEmailRateLimit(
  email: string
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  if (!redis) {
    return { allowed: true, remaining: EMAIL_RATE_LIMIT_MAX, resetIn: 0 };
  }

  const key = `email:rate:${email.toLowerCase()}`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.pexpire(key, EMAIL_RATE_LIMIT_WINDOW);
  }

  const ttl = await redis.pttl(key);

  return {
    allowed: current <= EMAIL_RATE_LIMIT_MAX,
    remaining: Math.max(0, EMAIL_RATE_LIMIT_MAX - current),
    resetIn: ttl > 0 ? ttl : 0
  };
}

export async function checkVerificationRateLimit(
  email: string
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  if (!redis) {
    return { allowed: true, remaining: VERIFICATION_RATE_LIMIT_MAX, resetIn: 0 };
  }

  const key = `email:verification:${email.toLowerCase()}`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.pexpire(key, VERIFICATION_RATE_LIMIT_WINDOW);
  }

  const ttl = await redis.pttl(key);

  return {
    allowed: current <= VERIFICATION_RATE_LIMIT_MAX,
    remaining: Math.max(0, VERIFICATION_RATE_LIMIT_MAX - current),
    resetIn: ttl > 0 ? ttl : 0
  };
}
