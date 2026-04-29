export const BASE64_MAX_RECURSION_DEPTH = 3;
export const BASE64_MAX_DECODED_BYTES = 64 * 1024;

const ZERO_WIDTH_CODEPOINTS = /\u200B|\u200C|\u200D|\uFEFF|\u2060/g;
const BASE64_CANDIDATE = /[A-Za-z0-9+/]{16,}={0,2}/g;
const WHITESPACE_RUN = /\s+/g;

const HOMOGLYPH_MAP: ReadonlyMap<string, string> = new Map([
  ['\u0430', 'a'],
  ['\u0435', 'e'],
  ['\u043E', 'o'],
  ['\u0440', 'p'],
  ['\u0441', 'c'],
  ['\u0445', 'x'],
  ['\u0443', 'y'],
  ['\u03BF', 'o'],
  ['\u03B1', 'a'],
  ['\u0455', 's']
]);

const LEET_MAP: ReadonlyMap<string, string> = new Map([
  ['0', 'o'],
  ['1', 'i'],
  ['3', 'e'],
  ['4', 'a'],
  ['5', 's'],
  ['7', 't'],
  ['@', 'a'],
  ['$', 's']
]);

export function stripZeroWidth(text: string): string {
  return text.replace(ZERO_WIDTH_CODEPOINTS, '');
}

export function decodeHomoglyphs(text: string): string {
  const normalized = text.normalize('NFKC');
  const chars = [...normalized];
  const mapped = chars.map((ch) => HOMOGLYPH_MAP.get(ch) ?? ch);
  return mapped.join('');
}

type Base64Budget = { depth: number; bytesRemaining: number };

function isMostlyPrintable(decoded: string): boolean {
  const chars = [...decoded];
  if (chars.length === 0) return false;
  const printable = chars.filter((ch) => ch >= ' ' && ch <= '~').length;
  return printable / chars.length >= 0.95;
}

function looksLikeBase64(match: string): boolean {
  return /[0-9+/=]/.test(match);
}

function tryDecodeBase64Match(match: string, budget: Base64Budget): string | null {
  if (budget.bytesRemaining <= 0) return null;
  if (!looksLikeBase64(match)) return null;
  try {
    const decoded = Buffer.from(match, 'base64').toString('utf8');
    if (!isMostlyPrintable(decoded)) return null;
    budget.bytesRemaining -= decoded.length;
    return decoded;
  } catch {
    return null;
  }
}

function decodeBase64Pass(text: string, budget: Base64Budget): string {
  return text.replace(BASE64_CANDIDATE, (match) => {
    const decoded = tryDecodeBase64Match(match, budget);
    return decoded ?? match;
  });
}

export function decodeBase64Substrings(text: string): string {
  const budget: Base64Budget = {
    depth: 0,
    bytesRemaining: BASE64_MAX_DECODED_BYTES
  };
  let current = text;
  while (budget.depth < BASE64_MAX_RECURSION_DEPTH) {
    const next = decodeBase64Pass(current, budget);
    if (next === current) return next;
    current = next;
    budget.depth += 1;
  }
  return current;
}

export function reverseLeet(text: string): string {
  const lower = text.toLowerCase();
  const chars = [...lower];
  const mapped = chars.map((ch) => LEET_MAP.get(ch) ?? ch);
  return mapped.join('');
}

export function collapseWhitespace(text: string): string {
  return text.replace(WHITESPACE_RUN, ' ').trim();
}

export function normalizeForScan(text: string): string {
  const stage1 = stripZeroWidth(text);
  const stage2 = decodeHomoglyphs(stage1);
  const stage3 = decodeBase64Substrings(stage2);
  const stage4 = reverseLeet(stage3);
  return collapseWhitespace(stage4);
}
