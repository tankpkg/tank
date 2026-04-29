import * as fs from 'node:fs';
import * as path from 'node:path';

export type ClawGuardSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ClawGuardCategory =
  | 'prompt_injection'
  | 'code_obfuscation'
  | 'data_exfiltration'
  | 'dangerous_command'
  | 'shell_injection'
  | 'social_engineering'
  | 'tool_manipulation';

export type ParsedPattern = {
  name: string;
  regexSource: string;
  severity: ClawGuardSeverity;
  category: ClawGuardCategory;
  recommendation: string;
};

const SECTION_TO_CATEGORY: ReadonlyMap<string, ClawGuardCategory> = new Map([
  ['PROMPT_INJECTION', 'prompt_injection'],
  ['DANGEROUS_COMMAND', 'dangerous_command'],
  ['PYTHON_OBFUSCATION', 'code_obfuscation'],
  ['DATA_EXFILTRATION', 'data_exfiltration'],
  ['SOCIAL_ENGINEERING', 'social_engineering'],
  ['SHELL_INJECTION', 'shell_injection'],
  ['TOOL_MANIPULATION', 'tool_manipulation']
]);

const SEVERITY_MAP: ReadonlyMap<string, ClawGuardSeverity> = new Map([
  ['Severity.LOW', 'low'],
  ['Severity.MEDIUM', 'medium'],
  ['Severity.HIGH', 'high'],
  ['Severity.CRITICAL', 'critical']
]);

export function severityToEnum(input: string): ClawGuardSeverity {
  const mapped = SEVERITY_MAP.get(input.trim());
  if (!mapped) {
    throw new Error(`Unknown severity: ${input}`);
  }
  return mapped;
}

function findSection(source: string, sectionKey: string): string | null {
  const header = `${sectionKey}_PATTERNS = [`;
  const start = source.indexOf(header);
  if (start === -1) return null;
  const bodyStart = start + header.length;
  const close = indexOfClosingBracket(source, bodyStart);
  return source.slice(bodyStart, close);
}

function indexOfClosingBracket(source: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < source.length) {
    const ch = source[i];
    const stringSkip = trySkipStringLiteral(source, i);
    if (stringSkip !== null) {
      i = stringSkip;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  throw new Error('Unclosed pattern list bracket');
}

function trySkipStringLiteral(source: string, at: number): number | null {
  const ch = source[at];
  if (ch !== '"' && ch !== "'") return null;
  const isTriple = source.startsWith(`${ch}${ch}${ch}`, at);
  const delim = isTriple ? `${ch}${ch}${ch}` : ch;
  const end = findStringClose(source, at + delim.length, delim);
  return end + delim.length;
}

function splitTopLevelTuples(body: string): string[] {
  const tuples: string[] = [];
  let depth = 0;
  let start = -1;
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    const stringEnd = trySkipStringLiteral(body, i);
    if (stringEnd !== null) {
      i = stringEnd;
      continue;
    }
    if (ch === '(') {
      if (depth === 0) start = i + 1;
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        tuples.push(body.slice(start, i));
        start = -1;
      }
    }
    i += 1;
  }
  return tuples;
}

type RegexParse = { source: string; rest: string };

function parseRegexLiteral(rest: string): RegexParse {
  const trimmed = rest.trimStart();
  const raw = trimmed.startsWith('r');
  const afterPrefix = raw ? trimmed.slice(1).trimStart() : trimmed;
  const quote = afterPrefix[0];
  if (quote !== '"' && quote !== "'") {
    throw new Error(`Expected regex string literal, got: ${afterPrefix.slice(0, 40)}`);
  }
  const isTriple = afterPrefix.startsWith(`${quote}${quote}${quote}`);
  const delim = isTriple ? `${quote}${quote}${quote}` : quote;
  const bodyStart = delim.length;
  const end = findStringClose(afterPrefix, bodyStart, delim);
  return {
    source: afterPrefix.slice(bodyStart, end),
    rest: afterPrefix.slice(end + delim.length)
  };
}

function findStringClose(text: string, from: number, delim: string): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (text.startsWith(delim, i)) return i;
  }
  throw new Error('Unclosed string literal');
}

function parseStringLiteral(rest: string): RegexParse {
  return parseRegexLiteral(rest);
}

function parseTuple(tupleBody: string, category: ClawGuardCategory): ParsedPattern {
  const nameParse = parseStringLiteral(tupleBody);
  const afterName = skipComma(nameParse.rest);
  const regexParse = parseRegexLiteral(afterName);
  const afterRegex = skipComma(regexParse.rest);
  const severityMatch = afterRegex.match(/^\s*(Severity\.[A-Z]+)/);
  const severityToken = severityMatch?.[1];
  if (!severityMatch || !severityToken) {
    throw new Error(`Expected severity in tuple: ${afterRegex.slice(0, 40)}`);
  }
  const severity = severityToEnum(severityToken);
  const afterSeverity = skipComma(afterRegex.slice(severityMatch[0].length));
  const categoryParse = parseStringLiteral(afterSeverity);
  const afterCategory = skipComma(categoryParse.rest);
  const recommendationParse = parseStringLiteral(afterCategory);
  return {
    name: nameParse.source,
    regexSource: regexParse.source,
    severity,
    category,
    recommendation: recommendationParse.source
  };
}

function skipComma(rest: string): string {
  const m = rest.match(/^\s*,\s*/);
  if (!m) throw new Error(`Expected comma, got: ${rest.slice(0, 40)}`);
  return rest.slice(m[0].length);
}

export function extractClawGuardPatterns(source: string): ParsedPattern[] {
  const patterns: ParsedPattern[] = [];
  let sectionsFound = 0;
  for (const [sectionKey, category] of SECTION_TO_CATEGORY) {
    const body = findSection(source, sectionKey);
    if (body === null) continue;
    sectionsFound += 1;
    const tuples = splitTopLevelTuples(body);
    for (const tuple of tuples) {
      patterns.push(parseTupleWithContext(tuple, category, sectionKey));
    }
  }
  if (sectionsFound === 0) {
    throw new Error('No ClawGuard pattern sections found in source');
  }
  return patterns;
}

function parseTupleWithContext(tuple: string, category: ClawGuardCategory, sectionKey: string): ParsedPattern {
  try {
    return parseTuple(tuple, category);
  } catch (err) {
    const head = tuple.trim().slice(0, 120).replace(/\n/g, '\\n');
    throw new Error(`parseTuple failed in section ${sectionKey}: ${(err as Error).message}\nTuple head: ${head}`);
  }
}

function quoteSingle(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function quoteTemplate(value: string): string {
  return `\`${value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\``;
}

function regexConstructor(regexSource: string): string {
  const { body, flags } = extractInlineFlags(regexSource);
  return `new RegExp(${quoteSingle(body)}, ${quoteSingle(flags)})`;
}

function extractInlineFlags(regexSource: string): { body: string; flags: string } {
  const match = regexSource.match(/^\(\?([imsx]+)\)/);
  if (!match) return { body: regexSource, flags: '' };
  const pythonFlags = match[1] ?? '';
  const jsFlags = pythonFlags
    .split('')
    .filter((f) => f === 'i' || f === 'm' || f === 's')
    .join('');
  return { body: regexSource.slice(match[0].length), flags: jsFlags };
}

function renderPattern(pattern: ParsedPattern): string {
  return [
    '  {',
    `    name: ${quoteSingle(pattern.name)},`,
    `    regex: ${regexConstructor(pattern.regexSource)},`,
    `    severity: ${quoteSingle(pattern.severity)},`,
    `    category: ${quoteSingle(pattern.category)},`,
    `    recommendation: ${quoteTemplate(pattern.recommendation)}`,
    '  }'
  ].join('\n');
}

export function renderPatternsModule(patterns: ParsedPattern[]): string {
  const header = [
    '// AUTO-GENERATED FILE — DO NOT EDIT',
    '// Source: packages/internals-helpers/vendor/clawguard/src/clawguard_core/_engine.py',
    '// Regenerate via: packages/internals-helpers/scripts/codegen-clawguard.ts',
    '// biome-ignore-all lint/complexity/useRegexLiterals: ported regex sources retain original escape sequences',
    '',
    "import type { ClawGuardPattern } from './types.js';",
    '',
    `export const CLAWGUARD_PATTERN_COUNT = ${patterns.length};`,
    '',
    'export const CLAWGUARD_PATTERNS: readonly ClawGuardPattern[] = ['
  ].join('\n');
  const body = patterns.map(renderPattern).join(',\n');
  return `${header}\n${body}\n];\n`;
}

function main(): void {
  const repoRoot = path.resolve(import.meta.dirname, '../../..');
  const enginePath = path.join(repoRoot, 'packages/internals-helpers/vendor/clawguard/src/clawguard_core/_engine.py');
  const outPath = path.join(repoRoot, 'packages/internals-helpers/src/prompt-injection/patterns.ts');
  const source = fs.readFileSync(enginePath, 'utf-8');
  const patterns = extractClawGuardPatterns(source);
  const module = renderPatternsModule(patterns);
  fs.writeFileSync(outPath, module);
  process.stdout.write(`Generated ${outPath} with ${patterns.length} patterns\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
