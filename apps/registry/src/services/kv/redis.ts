import { randomUUID } from 'node:crypto';
import Redis, { Command } from 'ioredis';

import type { KVStore } from './store';

// A receipt survives a reconnect even if the original key has since expired or
// been consumed. A pending receipt is indeterminate, never a successful retry.
// Each invocation chooses its own receipt; ioredis resends the same EVAL keys.
const RECEIPT_TTL_MS = 5 * 60 * 1000;

// Set an expiry before any increment that could otherwise create or retain a
// persistent counter. A replay may over-count, but never extends a live window.
const INCREMENT = `
  if redis.replicate_commands then redis.replicate_commands() end
  local ttl = redis.call('PTTL', KEYS[1])
  if ttl == -2 then
    redis.call('SET', KEYS[1], '1', 'PX', ARGV[1])
    return 1
  elseif ttl == -1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
  end
  return redis.call('INCR', KEYS[1])
`;

const COMPARE_AND_SET = `
  if redis.replicate_commands then redis.replicate_commands() end
  local receipt = redis.call('GET', KEYS[2])
  if receipt == 'done' then return 1 end
  if receipt == 'miss' then return 0 end
  if receipt then return {err = 'KV operation outcome is indeterminate'} end
  if ARGV[5] == '1' then return {err = 'KV operation outcome is indeterminate after Redis reconnect'} end
  local function mismatch()
    -- If recording a negative fails, the first reply is still known to be false.
    -- A subsequent replay without the receipt will instead be indeterminate.
    redis.pcall('SET', KEYS[2], 'miss', 'PX', ARGV[4], 'NX')
    return 0
  end
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return mismatch() end
  if ARGV[3] ~= '' then
    local now = redis.call('TIME')
    if tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000) >= tonumber(ARGV[3]) then return mismatch() end
  end
  local pending = redis.call('SET', KEYS[2], 'pending', 'PX', ARGV[4], 'NX')
  if not pending then return {err = 'KV receipt already exists'} end
  local changed = redis.pcall('SET', KEYS[1], ARGV[2], 'KEEPTTL')
  if type(changed) == 'table' and changed.err then
    redis.pcall('DEL', KEYS[2])
    return changed
  end
  local confirmed = redis.pcall('SET', KEYS[2], 'done', 'PX', ARGV[4], 'XX')
  if type(confirmed) == 'table' and confirmed.err then
    return {err = 'KV operation outcome is indeterminate: ' .. confirmed.err}
  end
  if not confirmed then return {err = 'KV operation outcome is indeterminate'} end
  return 1
`;

const COMPARE_AND_DELETE = `
  if redis.replicate_commands then redis.replicate_commands() end
  local receipt = redis.call('GET', KEYS[2])
  if receipt == 'done' then return 1 end
  if receipt == 'miss' then return 0 end
  if receipt then return {err = 'KV operation outcome is indeterminate'} end
  if ARGV[4] == '1' then return {err = 'KV operation outcome is indeterminate after Redis reconnect'} end
  local function mismatch()
    redis.pcall('SET', KEYS[2], 'miss', 'PX', ARGV[3], 'NX')
    return 0
  end
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return mismatch() end
  if ARGV[2] ~= '' then
    local now = redis.call('TIME')
    if tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000) >= tonumber(ARGV[2]) then return mismatch() end
  end
  local pending = redis.call('SET', KEYS[2], 'pending', 'PX', ARGV[3], 'NX')
  if not pending then return {err = 'KV receipt already exists'} end
  local deleted = redis.pcall('DEL', KEYS[1])
  if type(deleted) == 'table' and deleted.err then
    redis.pcall('DEL', KEYS[2])
    return deleted
  end
  if deleted ~= 1 then
    redis.pcall('SET', KEYS[2], 'miss', 'PX', ARGV[3], 'XX')
    return 0
  end
  local confirmed = redis.pcall('SET', KEYS[2], 'done', 'PX', ARGV[3], 'XX')
  if type(confirmed) == 'table' and confirmed.err then
    return {err = 'KV operation outcome is indeterminate: ' .. confirmed.err}
  end
  if not confirmed then return {err = 'KV operation outcome is indeterminate'} end
  return 1
`;

function crcByte(crc: number, byte: number): number {
  let next = crc ^ (byte << 8);
  for (let bit = 0; bit < 8; bit++) next = ((next << 1) ^ (next & 0x8000 ? 0x1021 : 0)) & 0xffff;
  return next;
}

function crc16(value: string): number {
  let crc = 0;
  for (const byte of new TextEncoder().encode(value)) crc = crcByte(crc, byte);
  return crc;
}

function slot(key: string): number {
  const open = key.indexOf('{');
  const close = open < 0 ? -1 : key.indexOf('}', open + 1);
  return crc16(close > open + 1 ? key.slice(open + 1, close) : key) & 0x3fff;
}

let slotSuffixes: string[] | undefined;

// CRC16 is linear: four zero bytes shift the prefix CRC, and the suffix CRC
// can then be XORed in. Four base36 characters cover all 16,384 Redis slots.
function slotSuffix(prefix: string, target: number): string {
  if (!slotSuffixes) {
    const suffixes = new Array<string>(0x4000);
    let remaining = suffixes.length;
    for (let index = 0; index < 36 ** 4 && remaining; index++) {
      const candidate = index.toString(36).padStart(4, '0');
      const candidateSlot = crc16(candidate) & 0x3fff;
      if (!suffixes[candidateSlot]) {
        suffixes[candidateSlot] = candidate;
        remaining--;
      }
    }
    if (remaining) throw new Error('Could not derive Redis receipt slot suffixes');
    slotSuffixes = suffixes;
  }
  let shifted = crc16(prefix);
  for (let index = 0; index < 4; index++) shifted = crcByte(shifted, 0);
  return slotSuffixes[target ^ (shifted & 0x3fff)];
}

// ioredis prefixes both EVAL keys. Match the physical key's slot while keeping
// the receipt under that same prefix, even when the prefix contains braces.
function receiptKey(key: string, prefix: string): string {
  const physical = prefix + key;
  const target = slot(physical);
  const id = randomUUID();
  const open = prefix.indexOf('{');
  const close = open < 0 ? -1 : prefix.indexOf('}', open + 1);
  if (close > open + 1) return `tank-kv-op:${id}`;
  if (open >= 0 && close < 0) return `${slotSuffix(prefix.slice(open + 1), target)}}:tank-kv-op:${id}`;
  if (open >= 0) {
    const base = `tank-kv-op:${id}:`;
    return base + slotSuffix(prefix + base, target);
  }
  const keyOpen = physical.indexOf('{');
  const keyClose = keyOpen < 0 ? -1 : physical.indexOf('}', keyOpen + 1);
  const tag =
    keyClose > keyOpen + 1
      ? physical.slice(keyOpen + 1, keyClose)
      : physical && keyOpen < 0 && !physical.includes('}')
        ? physical
        : slotSuffix('', target);
  return `{${tag}}:tank-kv-op:${id}`;
}

// ioredis resends the same Command on reconnect. Mark each actual write so the
// script never creates a new receipt for a replay whose first outcome was lost.
class CompareCommand extends Command {
  private sent = false;

  override toWritable(socket: object): string | Buffer {
    this.args[this.args.length - 1] = this.sent ? '1' : '0';
    this.sent = true;
    return super.toWritable(socket);
  }
}

function integerReply(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && !Object.is(value, -0) ? value : null;
  if (typeof value !== 'string' || !/^(?:0|-?[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function createRedisStore(url: string): KVStore {
  const client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  client.connect().catch(() => {});

  async function compare(script: string, args: (string | number)[]): Promise<boolean> {
    const command = new CompareCommand('eval', [script, 2, ...args, '0'], {
      keyPrefix: client.options.keyPrefix,
      replyEncoding: 'utf8'
    });
    const result = integerReply(await client.sendCommand(command));
    if (result === 1) return true;
    if (result !== 0) throw new Error('Unexpected Redis compare result');
    return false;
  }

  return {
    async get(key) {
      return client.get(key);
    },

    async set(key, value, ttlMs) {
      await client.set(key, value, 'PX', ttlMs);
    },

    async del(key) {
      await client.del(key);
    },

    async compareAndSet(key, expected, value, deadlineMs) {
      if (deadlineMs !== undefined && !Number.isSafeInteger(deadlineMs)) return false;
      return compare(COMPARE_AND_SET, [
        key,
        receiptKey(key, client.options.keyPrefix ?? ''),
        expected,
        value,
        deadlineMs ?? '',
        RECEIPT_TTL_MS
      ]);
    },

    async compareAndDelete(key, expected, deadlineMs) {
      if (deadlineMs !== undefined && !Number.isSafeInteger(deadlineMs)) return false;
      return compare(COMPARE_AND_DELETE, [
        key,
        receiptKey(key, client.options.keyPrefix ?? ''),
        expected,
        deadlineMs ?? '',
        RECEIPT_TTL_MS
      ]);
    },

    async incr(key, ttlMs) {
      if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('Counter TTL must be a positive integer');
      const result = integerReply(await client.eval(INCREMENT, 1, key, ttlMs));
      if (result === null) throw new Error('Unexpected Redis increment result');
      return result;
    }
  };
}
