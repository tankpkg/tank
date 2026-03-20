import { eq } from 'drizzle-orm';
import { decrypt, encrypt } from '~/lib/crypto';
import { db } from '~/lib/db';
import { systemConfig } from '~/lib/db/schema';

let cachedSetupCompleted: boolean | null = null;

export async function isSetupCompleted(): Promise<boolean> {
  if (cachedSetupCompleted === true) return true;

  try {
    const [row] = await db
      .select({ completed: systemConfig.setupCompleted })
      .from(systemConfig)
      .where(eq(systemConfig.id, 1))
      .limit(1);
    cachedSetupCompleted = row?.completed ?? false;
    return cachedSetupCompleted;
  } catch {
    return false;
  }
}

export function resetSetupCache() {
  cachedSetupCompleted = null;
}

export async function getSystemConfig() {
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.id, 1)).limit(1);
  return row ?? null;
}

export async function upsertSystemConfig(values: Partial<typeof systemConfig.$inferInsert>) {
  const existing = await getSystemConfig();
  if (existing) {
    await db.update(systemConfig).set(values).where(eq(systemConfig.id, 1));
  } else {
    await db.insert(systemConfig).values({ id: 1, ...values });
  }
  resetSetupCache();
}

function getMasterKey(): string {
  const key = process.env.BETTER_AUTH_SECRET;
  if (!key) throw new Error('BETTER_AUTH_SECRET is required for encryption');
  return key;
}

export function encryptSecret(plaintext: string): string {
  return encrypt(plaintext, getMasterKey());
}

export function decryptSecret(ciphertext: string): string {
  return decrypt(ciphertext, getMasterKey());
}
