import { CREDENTIAL_PATTERNS } from '../detector/patterns.ts';

function randomIndex(max: number): number {
  const maxUint32 = 0x100000000;
  const limit = maxUint32 - (maxUint32 % max);
  const buffer = new Uint32Array(1);

  while (true) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] ?? 0;
    if (value < limit) {
      return value % max;
    }
  }
}

function generateSuffix(length: number, charset: string): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const index = randomIndex(charset.length);
    result += charset[index] ?? '';
  }
  return result;
}

function hasOverlapOfFiveOrMore(realSuffix: string, fakeSuffix: string): boolean {
  if (realSuffix.length < 5 || fakeSuffix.length < 5) {
    return false;
  }

  for (let len = 5; len <= realSuffix.length; len++) {
    for (let i = 0; i <= realSuffix.length - len; i++) {
      if (fakeSuffix.includes(realSuffix.slice(i, i + len))) {
        return true;
      }
    }
  }

  return false;
}

export function generateFake(real: string, patternId: string): string {
  const pattern = CREDENTIAL_PATTERNS.find((candidate) => candidate.id === patternId);
  if (!pattern) {
    throw new Error(`Unknown credential pattern: ${patternId}`);
  }

  const prefix = pattern.prefix;
  const suffixLength = Math.max(real.length - prefix.length, 0);
  const realSuffix = real.slice(prefix.length);

  for (let attempt = 0; attempt < 10; attempt++) {
    const fakeSuffix = generateSuffix(suffixLength, pattern.charset);
    const fake = `${prefix}${fakeSuffix}`;
    if (fake === real) {
      continue;
    }
    if (hasOverlapOfFiveOrMore(realSuffix, fakeSuffix)) {
      continue;
    }
    return fake;
  }

  let fakeSuffix = generateSuffix(suffixLength, pattern.charset);
  if (fakeSuffix === realSuffix && suffixLength > 0) {
    const charset = pattern.charset;
    const first = fakeSuffix[0] ?? charset[0] ?? '';
    let replacement = first;
    for (const ch of charset) {
      if (ch !== first) {
        replacement = ch;
        break;
      }
    }
    fakeSuffix = `${replacement}${fakeSuffix.slice(1)}`;
  }
  return `${prefix}${fakeSuffix}`;
}
