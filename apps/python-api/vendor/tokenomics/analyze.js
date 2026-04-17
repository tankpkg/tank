#!/usr/bin/env node

// src/analyze.ts
import { parseArgs } from "util";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { homedir as homedir6 } from "os";
import { join as join9 } from "path";

// src/skill-analyzer.ts
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname, relative } from "path";

// src/skill-rules/prompt-size.ts
var CHARS_PER_TOKEN = 4;
var MEDIUM_TOKEN_THRESHOLD = 2e3;
var HIGH_TOKEN_THRESHOLD = 4e3;
var PROMPT_FILE_PATTERNS = [
  /^SKILL\.md$/i,
  /\.atom\.md$/i
];
function isPromptFile(filename) {
  return PROMPT_FILE_PATTERNS.some((p) => p.test(filename));
}
function analyze(context) {
  const findings = [];
  for (const [filename, content] of context.files) {
    if (!isPromptFile(filename)) continue;
    const tokenEstimate = Math.ceil(content.length / CHARS_PER_TOKEN);
    if (tokenEstimate > HIGH_TOKEN_THRESHOLD) {
      findings.push({
        rule: "prompt-size",
        severity: "high",
        confidence: 0.95,
        description: `Prompt file "${filename}" is ~${tokenEstimate.toLocaleString()} tokens (${content.length.toLocaleString()} chars). This loads into context on every skill invocation.`,
        location: filename,
        remediation: `Trim "${filename}" to under ${HIGH_TOKEN_THRESHOLD} tokens. Move detailed examples, edge cases, or reference material to separate files that are read on demand. Keep the core instructions concise.`
      });
    } else if (tokenEstimate > MEDIUM_TOKEN_THRESHOLD) {
      findings.push({
        rule: "prompt-size",
        severity: "medium",
        confidence: 0.9,
        description: `Prompt file "${filename}" is ~${tokenEstimate.toLocaleString()} tokens (${content.length.toLocaleString()} chars). Consider trimming for faster invocations.`,
        location: filename,
        remediation: `Consider trimming "${filename}" to under ${MEDIUM_TOKEN_THRESHOLD} tokens. Extract verbose examples or lengthy explanations into separate reference files.`
      });
    }
  }
  return findings;
}

// src/skill-rules/claude-md-size.ts
var CHARS_PER_TOKEN2 = 4;
var MEDIUM_TOKEN_THRESHOLD2 = 1500;
var HIGH_TOKEN_THRESHOLD2 = 3e3;
function analyze2(context) {
  const findings = [];
  for (const [filename, content] of context.files) {
    if (!filename.toLowerCase().includes("claude.md")) continue;
    const tokenomicsBlocks = extractTokenomicsBlocks(content);
    if (tokenomicsBlocks.length > 0) {
      for (const block of tokenomicsBlocks) {
        const tokenEstimate2 = Math.ceil(block.length / CHARS_PER_TOKEN2);
        flagBlock(findings, filename, tokenEstimate2, "tokenomics injection block");
      }
      continue;
    }
    const tokenEstimate = Math.ceil(content.length / CHARS_PER_TOKEN2);
    flagBlock(findings, filename, tokenEstimate, "CLAUDE.md content");
  }
  return findings;
}
function extractTokenomicsBlocks(content) {
  const blocks = [];
  const startMarker = "<!-- TOKENOMICS:START";
  const endMarker = "<!-- TOKENOMICS:END";
  let searchFrom = 0;
  while (searchFrom < content.length) {
    const startIdx = content.indexOf(startMarker, searchFrom);
    if (startIdx === -1) break;
    const endIdx = content.indexOf(endMarker, startIdx);
    if (endIdx === -1) break;
    const endOfBlock = content.indexOf("\n", endIdx);
    const blockEnd = endOfBlock === -1 ? content.length : endOfBlock;
    blocks.push(content.slice(startIdx, blockEnd));
    searchFrom = blockEnd;
  }
  return blocks;
}
function flagBlock(findings, filename, tokenEstimate, blockDescription) {
  if (tokenEstimate > HIGH_TOKEN_THRESHOLD2) {
    findings.push({
      rule: "claude-md-size",
      severity: "high",
      confidence: 0.9,
      description: `${blockDescription} in "${filename}" is ~${tokenEstimate.toLocaleString()} tokens. This injects into every session's system prompt.`,
      location: filename,
      remediation: `Reduce the ${blockDescription} in "${filename}" to under ${HIGH_TOKEN_THRESHOLD2} tokens. Use dynamic placeholders or move static content to files that are read on demand.`
    });
  } else if (tokenEstimate > MEDIUM_TOKEN_THRESHOLD2) {
    findings.push({
      rule: "claude-md-size",
      severity: "medium",
      confidence: 0.85,
      description: `${blockDescription} in "${filename}" is ~${tokenEstimate.toLocaleString()} tokens. Every session pays this context cost.`,
      location: filename,
      remediation: `Trim the ${blockDescription} in "${filename}" to under ${MEDIUM_TOKEN_THRESHOLD2} tokens. Remove redundant instructions or consolidate overlapping guidance.`
    });
  }
}

// src/skill-rules/tool-overhead.ts
var MEDIUM_TOOL_THRESHOLD = 8;
var HIGH_TOOL_THRESHOLD = 15;
var TOOL_SECTIONS = ["tools", "mcpServers", "mcp_servers", "serverTools", "server_tools"];
var MANIFEST_FILES = ["tank.json", "skills.json"];
function countTools(manifest, files) {
  const tools = [];
  if (manifest) {
    const toolSections = TOOL_SECTIONS;
    for (const section of toolSections) {
      const sectionData = manifest[section];
      if (typeof sectionData === "object" && sectionData !== null) {
        if (Array.isArray(sectionData)) {
          for (const entry of sectionData) {
            if (typeof entry === "object" && entry !== null && "name" in entry) {
              tools.push({ name: String(entry["name"]), source: "manifest" });
            }
          }
        } else {
          for (const key of Object.keys(sectionData)) {
            tools.push({ name: key, source: "manifest" });
          }
        }
      }
    }
  }
  for (const [filename, content] of files) {
    if (!MANIFEST_FILES.includes(filename) && !filename.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(content);
      for (const section of TOOL_SECTIONS) {
        const sectionData = parsed[section];
        if (typeof sectionData === "object" && sectionData !== null && !Array.isArray(sectionData)) {
          for (const key of Object.keys(sectionData)) {
            if (!tools.some((t) => t.name === key)) {
              tools.push({ name: key, source: filename });
            }
          }
        }
      }
    } catch {
    }
  }
  return tools;
}
function analyze3(context) {
  const findings = [];
  const tools = countTools(context.skillManifest, context.files);
  const toolCount = tools.length;
  if (toolCount > HIGH_TOOL_THRESHOLD) {
    findings.push({
      rule: "tool-overhead",
      severity: "high",
      confidence: 0.9,
      description: `${toolCount} tool definitions found. Each tool adds ~200-500 tokens of context overhead per invocation (~${toolCount * 200}-${toolCount * 500} extra tokens total).`,
      location: "manifest/config",
      remediation: `Reduce to ${HIGH_TOOL_THRESHOLD} or fewer tools. Remove unused tools, or use lazy-loading patterns where tools are only registered when the skill enters a specific workflow.`
    });
  } else if (toolCount > MEDIUM_TOOL_THRESHOLD) {
    findings.push({
      rule: "tool-overhead",
      severity: "medium",
      confidence: 0.85,
      description: `${toolCount} tool definitions found. Each tool adds ~200-500 tokens of context overhead per invocation (~${toolCount * 200}-${toolCount * 500} extra tokens total).`,
      location: "manifest/config",
      remediation: `Consider reducing to ${MEDIUM_TOOL_THRESHOLD} or fewer tools. Consolidate related tools or implement on-demand registration.`
    });
  }
  return findings;
}

// src/skill-rules/large-files.ts
var CHARS_PER_TOKEN3 = 4;
var LINE_THRESHOLD = 500;
function analyze4(context) {
  const findings = [];
  for (const [filename, content] of context.files) {
    const lineCount = content.split("\n").length;
    if (lineCount > LINE_THRESHOLD) {
      findings.push({
        rule: "large-files",
        severity: lineCount > 1e3 ? "medium" : "low",
        confidence: 0.8,
        description: `"${filename}" is ${lineCount.toLocaleString()} lines. Reading this file costs ~${Math.ceil(content.length / CHARS_PER_TOKEN3).toLocaleString()} tokens per invocation.`,
        location: filename,
        remediation: `Split "${filename}" into smaller, focused files. Use lazy-loading: keep an index/summary file and load detailed sections only when needed.`
      });
    }
  }
  return findings;
}

// src/skill-rules/redundant-instructions.ts
var DUPLICATION_THRESHOLD = 0.3;
var MIN_LINE_LENGTH = 20;
var SKILL_FILE_PATTERNS = [
  /SKILL\.md$/i,
  /\.atom\.md$/i,
  /CLAUDE\.md$/i
];
function isSkillFile(filename) {
  return SKILL_FILE_PATTERNS.some((p) => p.test(filename));
}
function normalizeLine(line) {
  return line.toLowerCase().trim().replace(/\s+/g, " ");
}
function analyze5(context) {
  const findings = [];
  const fileLines = /* @__PURE__ */ new Map();
  for (const [filename, content] of context.files) {
    if (!isSkillFile(filename)) continue;
    const lines = content.split("\n").map(normalizeLine).filter((l) => l.length >= MIN_LINE_LENGTH);
    fileLines.set(filename, lines);
  }
  if (fileLines.size < 2) return findings;
  const allLines = [];
  const lineFileCount = /* @__PURE__ */ new Map();
  for (const [filename, lines] of fileLines) {
    for (const line of lines) {
      allLines.push(line);
      const entry = lineFileCount.get(line) ?? { count: 0, files: [] };
      entry.count++;
      if (!entry.files.includes(filename)) {
        entry.files.push(filename);
      }
      lineFileCount.set(line, entry);
    }
  }
  const totalLines = allLines.length;
  if (totalLines === 0) return findings;
  const duplicatedLines = [...lineFileCount.entries()].filter(([, entry]) => entry.files.length >= 2);
  const duplicatedCount = duplicatedLines.reduce((sum, [, entry]) => {
    return sum + entry.count - Math.ceil(entry.count / entry.files.length);
  }, 0);
  const duplicationRate = duplicatedCount / totalLines;
  if (duplicationRate > DUPLICATION_THRESHOLD) {
    const exampleDuplicates = duplicatedLines.slice(0, 3).map(([line, entry]) => `"${line.slice(0, 60)}${line.length > 60 ? "..." : ""}" in ${entry.files.join(", ")}`).join("\n    ");
    findings.push({
      rule: "redundant-instructions",
      severity: duplicationRate > 0.5 ? "medium" : "low",
      confidence: 0.75,
      description: `${Math.round(duplicationRate * 100)}% of instruction lines are duplicated across skill files. ${duplicatedCount} of ${totalLines} lines are redundant, wasting tokens on every invocation.`,
      location: [...fileLines.keys()].join(", "),
      remediation: `Consolidate shared instructions into a single file and reference it from others. Remove duplicated lines from individual files. Examples:
    ${exampleDuplicates}`
    });
  }
  return findings;
}

// src/skill-rules/section-analysis.ts
var CHARS_PER_TOKEN4 = 4;
var SECTION_TOKEN_THRESHOLD = 500;
var LARGE_SECTION_THRESHOLD = 1e3;
var FILE_TOKEN_BREAKDOWN_THRESHOLD = 1e3;
var PROMPT_FILE_PATTERNS2 = [
  /^SKILL\.md$/i,
  /\.atom\.md$/i
];
var ALL_MD_PATTERN = /\.md$/i;
function isPromptFile2(filename) {
  return PROMPT_FILE_PATTERNS2.some((p) => p.test(filename));
}
function isMarkdownFile(filename) {
  return ALL_MD_PATTERN.test(filename);
}
function parseSections(content) {
  const lines = content.split("\n");
  const sections = [];
  let currentHeading = "(preamble)";
  let currentLevel = 0;
  let currentLineStart = 0;
  let currentLines = [];
  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentLines.length > 0 || currentHeading !== "(preamble)") {
        const sectionContent = currentLines.join("\n");
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          lineStart: currentLineStart,
          content: sectionContent,
          tokens: Math.ceil(sectionContent.length / CHARS_PER_TOKEN4)
        });
      }
      currentHeading = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentLineStart = i;
      currentLines = [];
    } else {
      currentLines.push(lines[i]);
    }
  }
  const lastContent = currentLines.join("\n");
  if (lastContent.trim().length > 0 || currentHeading !== "(preamble)") {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      lineStart: currentLineStart,
      content: lastContent,
      tokens: Math.ceil(lastContent.length / CHARS_PER_TOKEN4)
    });
  }
  return sections;
}
function normalizeContent(content) {
  return content.toLowerCase().replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "").replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}
function jaccardSimilarity(textA, textB) {
  const normA = normalizeContent(textA);
  const normB = normalizeContent(textB);
  if (normA.length < 20 || normB.length < 20) return 0;
  const wordsA = new Set(normA.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(normB.split(" ").filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const union = /* @__PURE__ */ new Set([...wordsA, ...wordsB]);
  return intersection.length / union.size;
}
function detectRedundancy(allFileSections) {
  const links = [];
  const allSections = [];
  for (const fs of allFileSections) {
    for (const s of fs.sections) {
      allSections.push({ file: fs.filename, section: s });
    }
  }
  for (let i = 0; i < allSections.length; i++) {
    const a = allSections[i];
    if (a.section.tokens < 20) continue;
    for (let j = i + 1; j < allSections.length; j++) {
      const b = allSections[j];
      if (b.section.tokens < 20) continue;
      const similarity = jaccardSimilarity(a.section.content, b.section.content);
      if (similarity > 0.25) {
        links.push({
          sourceFile: a.file,
          sourceSection: a.section.heading,
          targetFile: b.file,
          targetSection: b.section.heading,
          similarity
        });
      }
    }
  }
  return links.sort((a, b) => b.similarity - a.similarity);
}
function getShorteningTip(section) {
  const lines = section.content.split("\n").filter((l) => l.trim().length > 0);
  const tips = [];
  const lineCounts = /* @__PURE__ */ new Map();
  for (const line of lines) {
    const norm = line.toLowerCase().trim();
    if (norm.length < 20) continue;
    lineCounts.set(norm, (lineCounts.get(norm) ?? 0) + 1);
  }
  const repeatedLines = [...lineCounts.entries()].filter(([, c]) => c > 1);
  if (repeatedLines.length > 0) {
    const example = repeatedLines[0][0].slice(0, 60);
    tips.push(`Contains ${repeatedLines.length} repeated line(s), e.g. "${example}..."`);
  }
  const codeBlockCount = (section.content.match(/```/g) ?? []).length / 2;
  if (codeBlockCount >= 2) {
    tips.push(`Has ${Math.floor(codeBlockCount)} code blocks \u2014 consider replacing examples with file references`);
  }
  const listItems = lines.filter((l) => /^\s*[-*]\s/.test(l) || /^\s*\d+\.\s/.test(l));
  if (listItems.length > 8) {
    tips.push(`${listItems.length} list items \u2014 consider grouping into categories or moving details to separate files`);
  }
  const tableRows = lines.filter((l) => /^\|/.test(l.trim()));
  if (tableRows.length > 15) {
    tips.push(`${tableRows.length} table rows \u2014 consider moving detailed tables to reference files and keeping only a summary`);
  }
  const normalizedContent = normalizeContent(section.content);
  const PHRASE_MIN_LENGTH = 4;
  const words = normalizedContent.split(" ").filter((w) => w.length > 2);
  const phraseCounts = /* @__PURE__ */ new Map();
  for (let i = 0; i < words.length - PHRASE_MIN_LENGTH; i++) {
    const phrase = words.slice(i, i + PHRASE_MIN_LENGTH).join(" ");
    phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
  }
  const repeatedPhrases = [...phraseCounts.entries()].filter(([, c]) => c >= 3);
  if (repeatedPhrases.length > 0) {
    const topPhrase = repeatedPhrases.sort((a, b) => b[1] - a[1])[0];
    tips.push(`Concept "${topPhrase[0].slice(0, 50)}..." is restated ${topPhrase[1]} times \u2014 state the rule once, reference it elsewhere`);
  }
  const restatementPatterns = [
    /remember.{0,10}(that|:)\s/gi,
    /note.{0,5}(that|:)\s/gi,
    /this (is|means)\s/gi,
    /in other words/gi,
    /that (is to say|means)\s/gi,
    /this is (non-)?negotiable/gi
  ];
  let restatementCount = 0;
  for (const pattern of restatementPatterns) {
    const matches = section.content.match(pattern);
    if (matches) restatementCount += matches.length;
  }
  if (restatementCount >= 2) {
    tips.push(`${restatementCount} restatement(s) detected ("remember that", "note that", "in other words") \u2014 the AI already understood the first time; remove re-explanations`);
  }
  const badGoodPairs = section.content.match(/\bad\b|\bwrong\b|\bdon't\b|\bavoid\b|\bnever\b/gi) ?? [];
  const goodExamples = section.content.match(/\bgood\b|\bcorrect\b|\bfixed\b|\bfixed\b|\binstead\b|\brather\b/gi) ?? [];
  if (badGoodPairs.length >= 3 && goodExamples.length >= 3) {
    tips.push(`Shows ${badGoodPairs.length} bad examples alongside good ones \u2014 consider showing only the correct pattern and stating the rule as a negative constraint (e.g. "never do X")`);
  }
  const specificPaths = section.content.match(/[\w/-]+\.\w{2,4}/g) ?? [];
  const uniquePaths = new Set(specificPaths.map((p) => p.toLowerCase()));
  if (uniquePaths.size > 6) {
    tips.push(`References ${uniquePaths.size} specific file paths \u2014 consider replacing some with a glob pattern or naming convention rule`);
  }
  const justificationPatterns = section.content.match(/(this is important|the reason for|why\? because|this matters because|this is critical because)/gi) ?? [];
  if (justificationPatterns.length >= 2) {
    tips.push(`${justificationPatterns.length} justification(s) ("this is important because", "the reason for") \u2014 the AI follows instructions without needing persuasion; state the rule directly`);
  }
  const treeLineCount = lines.filter((l) => /^[├└│─┤┬┴┼┌┐└┘││  ]+[a-z]/.test(l) || /^\s+[a-z_]+\/\s*$/i.test(l)).length;
  if (treeLineCount > 10) {
    tips.push(`Directory tree is ${treeLineCount} lines \u2014 consider keeping only the top-level structure and linking to a reference file for the full tree`);
  }
  return tips.length > 0 ? tips.join(". ") + "." : void 0;
}
function analyze6(context) {
  const findings = [];
  const promptFileSections = [];
  const referenceFileSections = [];
  for (const [filename, content] of context.files) {
    if (!isMarkdownFile(filename)) continue;
    if (content.trim().length === 0) continue;
    const sections = parseSections(content);
    if (sections.length === 0) continue;
    const totalTokens = Math.ceil(content.length / CHARS_PER_TOKEN4);
    const entry = { filename, sections, totalTokens };
    if (isPromptFile2(filename)) {
      promptFileSections.push(entry);
    } else if (filename.includes("references/")) {
      referenceFileSections.push(entry);
    }
  }
  const allFileSections = [...promptFileSections, ...referenceFileSections];
  const redundancyLinks = detectRedundancy(allFileSections);
  const redundancyLookup = /* @__PURE__ */ new Map();
  for (const link of redundancyLinks) {
    let fileMap = redundancyLookup.get(link.sourceFile);
    if (!fileMap) {
      fileMap = /* @__PURE__ */ new Map();
      redundancyLookup.set(link.sourceFile, fileMap);
    }
    let peers = fileMap.get(link.sourceSection);
    if (!peers) {
      peers = [];
      fileMap.set(link.sourceSection, peers);
    }
    peers.push({ file: link.targetFile, section: link.targetSection });
    fileMap = redundancyLookup.get(link.targetFile);
    if (!fileMap) {
      fileMap = /* @__PURE__ */ new Map();
      redundancyLookup.set(link.targetFile, fileMap);
    }
    peers = fileMap.get(link.targetSection);
    if (!peers) {
      peers = [];
      fileMap.set(link.targetSection, peers);
    }
    peers.push({ file: link.sourceFile, section: link.sourceSection });
  }
  for (const { filename, sections, totalTokens } of promptFileSections) {
    const fileRedundancy = redundancyLookup.get(filename) ?? /* @__PURE__ */ new Map();
    const sectionData = sections.map((s) => {
      const peers = fileRedundancy.get(s.heading);
      const peerLabels = peers ? [...new Set(peers.map((p) => p.file === filename ? `"${p.section}"` : `${p.file} \u2192 "${p.section}"`))] : void 0;
      return {
        heading: s.heading,
        level: s.level,
        lineStart: s.lineStart,
        tokens: s.tokens,
        redundantWith: peerLabels && peerLabels.length > 0 ? peerLabels : void 0,
        shorteningTip: getShorteningTip(s)
      };
    });
    const largeSections = sections.filter((s) => s.tokens > SECTION_TOKEN_THRESHOLD);
    const redundantSections = sections.filter((s) => (fileRedundancy.get(s.heading) ?? []).length > 0);
    const shortenableSections = sections.filter((_, idx) => sectionData[idx].shorteningTip !== void 0);
    const hasLargeFile = totalTokens > FILE_TOKEN_BREAKDOWN_THRESHOLD;
    if (!hasLargeFile && largeSections.length === 0 && redundantSections.length === 0 && shortenableSections.length === 0) continue;
    const parts = [];
    if (largeSections.length > 0) {
      const top = largeSections.sort((a, b) => b.tokens - a.tokens)[0];
      parts.push(`Largest section "${top.heading}" is ~${top.tokens.toLocaleString()} tokens`);
    }
    if (redundantSections.length > 0) {
      const crossFile = redundantSections.filter((s) => {
        const peers = fileRedundancy.get(s.heading) ?? [];
        return peers.some((p) => p.file !== filename);
      });
      if (crossFile.length > 0) {
        parts.push(`${crossFile.length} section(s) duplicate content from reference files`);
      }
      const withinFile = redundantSections.filter((s) => {
        const peers = fileRedundancy.get(s.heading) ?? [];
        return peers.some((p) => p.file === filename);
      });
      if (withinFile.length > 0) {
        const names = withinFile.map((s) => `"${s.heading}"`);
        parts.push(`${withinFile.length} section(s) overlap each other: ${names.join(", ")}`);
      }
    }
    if (shortenableSections.length > 0) {
      parts.push(`${shortenableSections.length} section(s) have shortening opportunities`);
    }
    const maxTokens = Math.max(...sections.map((s) => s.tokens));
    const severity = maxTokens > LARGE_SECTION_THRESHOLD ? "high" : largeSections.length > 0 ? "medium" : redundantSections.length > 0 ? "low" : "info";
    const remediationParts = [];
    for (const s of largeSections.sort((a, b) => b.tokens - a.tokens).slice(0, 3)) {
      remediationParts.push(`"${s.heading}" (${s.tokens} tokens): split into smaller focused subsections or move details to separate files`);
    }
    for (const s of redundantSections.slice(0, 3)) {
      const peers = fileRedundancy.get(s.heading) ?? [];
      const crossFilePeers = peers.filter((p) => p.file !== filename);
      const sameFilePeers = peers.filter((p) => p.file === filename);
      if (crossFilePeers.length > 0) {
        const targets = [...new Set(crossFilePeers.map((p) => `${p.file} "${p.section}"`))].join(", ");
        remediationParts.push(`"${s.heading}" duplicates content from ${targets}: keep it in one place, reference from the other`);
      }
      if (sameFilePeers.length > 0) {
        const targets = [...new Set(sameFilePeers.map((p) => `"${p.section}"`))].join(", ");
        remediationParts.push(`"${s.heading}" overlaps with ${targets}: consolidate shared content into one section`);
      }
    }
    for (const s of shortenableSections.slice(0, 3)) {
      const idx = sections.indexOf(s);
      const tip = sectionData[idx].shorteningTip;
      remediationParts.push(`"${s.heading}": ${tip}`);
    }
    const topSections = [...sections].sort((a, b) => b.tokens - a.tokens).slice(0, 5);
    const breakdown = topSections.map((s) => `"${s.heading}": ${s.tokens}`).join(", ");
    findings.push({
      rule: "section-analysis",
      severity,
      confidence: 0.8,
      description: parts.length > 0 ? `${filename}: ${parts.join(". ")}. Total: ~${totalTokens.toLocaleString()} tokens across ${sections.length} sections (top: ${breakdown})` : `${filename}: ~${totalTokens.toLocaleString()} tokens across ${sections.length} sections. Token breakdown: ${breakdown}`,
      location: filename,
      remediation: remediationParts.length > 0 ? remediationParts.join("\n") : "No shortening opportunities detected \u2014 structure looks efficient.",
      sections: sectionData
    });
  }
  return findings;
}

// src/skill-analyzer.ts
var CHARS_PER_TOKEN5 = 4;
var SKILL_FILES = [
  "SKILL.md",
  "CLAUDE.md",
  "tank.json",
  "skills.json"
];
var SKILL_EXTENSIONS = [".md", ".json"];
var rules = [
  { name: "prompt-size", analyze },
  { name: "claude-md-size", analyze: analyze2 },
  { name: "tool-overhead", analyze: analyze3 },
  { name: "large-files", analyze: analyze4 },
  { name: "redundant-instructions", analyze: analyze5 },
  { name: "section-analysis", analyze: analyze6 }
];
function discoverSkillFiles(dir) {
  const files = /* @__PURE__ */ new Map();
  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
        walk(join(currentDir, entry.name));
        continue;
      }
      const fullPath = join(currentDir, entry.name);
      const relativePath = relative(dir, fullPath);
      const isKnownFile = SKILL_FILES.some((f) => entry.name.toLowerCase() === f.toLowerCase());
      const isAtomFile = entry.name.toLowerCase().endsWith(".atom.md");
      const hasSkillExt = SKILL_EXTENSIONS.includes(extname(entry.name).toLowerCase());
      if (isKnownFile || isAtomFile || hasSkillExt) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          files.set(relativePath, content);
        } catch {
        }
      }
    }
  }
  walk(dir);
  return files;
}
function loadManifest(files) {
  for (const manifestName of ["tank.json", "skills.json"]) {
    for (const [filename, content] of files) {
      if (filename.toLowerCase().endsWith(manifestName.toLowerCase())) {
        try {
          return JSON.parse(content);
        } catch {
        }
      }
    }
  }
  return null;
}
function estimateTokens(files) {
  let totalChars = 0;
  for (const content of files.values()) {
    totalChars += content.length;
  }
  return Math.ceil(totalChars / CHARS_PER_TOKEN5);
}
var SONNET_INPUT_PER_M = 3;
var OPUS_INPUT_PER_M = 15;
var AVG_SKILL_TOKENS = 2e4;
function estimateCost(tokens) {
  const tokenMillions = tokens / 1e6;
  const sonnetCost = tokenMillions * SONNET_INPUT_PER_M;
  const opusCost = tokenMillions * OPUS_INPUT_PER_M;
  return {
    sonnet_context_load: formatUsd(sonnetCost),
    opus_context_load: formatUsd(opusCost),
    token_count: tokens,
    pricing_note: `Based on input pricing: $${SONNET_INPUT_PER_M}/M (Sonnet), $${OPUS_INPUT_PER_M}/M (Opus). Actual cost depends on how the skill is loaded, cache behavior, and session length.`
  };
}
function formatUsd(amount) {
  if (amount < 1e-3) return "<$0.001";
  if (amount < 0.01) return `~$${amount.toFixed(3)}`;
  if (amount < 0.1) return `~$${amount.toFixed(2)}`;
  if (amount < 1) return `~$${amount.toFixed(2)}`;
  return `~$${amount.toFixed(2)}`;
}
function calculateGrade(score) {
  if (score >= 85) return "A";
  if (score >= 65) return "B";
  if (score >= 40) return "C";
  return "D";
}
function calculateEfficiencyScore(findings, totalTokens) {
  let score = 100;
  for (const finding of findings) {
    const deduction = finding.severity === "high" ? 15 : finding.severity === "medium" ? 8 : finding.severity === "low" ? 3 : 1;
    score -= deduction;
  }
  if (totalTokens < 1e3) score = Math.min(score + 10, 100);
  return Math.max(0, Math.min(100, score));
}
function generateOneLiner(grade, tokens, findingsCount) {
  if (grade === "A" && tokens < 5e3) return "Lean and efficient. No meaningful improvements needed.";
  if (grade === "A") return "Well-structured skill with no significant waste.";
  if (grade === "B") {
    if (findingsCount <= 2) return "Slightly above average size. Works fine, could be leaner.";
    return "Good shape overall, with a few areas that could be tightened up.";
  }
  if (grade === "C") return "Carries noticeable token overhead. Several sections could be trimmed or consolidated.";
  return "Bloated \u2014 significant token waste. Multiple sections duplicate content or over-explain.";
}
function generateComparison(tokens) {
  const ratio = tokens / AVG_SKILL_TOKENS;
  if (ratio < 0.3) return `${tokens.toLocaleString()} tokens \u2014 much smaller than avg (~${AVG_SKILL_TOKENS.toLocaleString()} tokens)`;
  if (ratio < 0.7) return `${tokens.toLocaleString()} tokens \u2014 below average (avg is ~${AVG_SKILL_TOKENS.toLocaleString()} tokens)`;
  if (ratio < 1.3) return `${tokens.toLocaleString()} tokens \u2014 about average for a skill (~${AVG_SKILL_TOKENS.toLocaleString()} tokens)`;
  if (ratio < 2) return `${tokens.toLocaleString()} tokens \u2014 above average (avg is ~${AVG_SKILL_TOKENS.toLocaleString()} tokens)`;
  return `${tokens.toLocaleString()} tokens \u2014 much larger than avg (~${AVG_SKILL_TOKENS.toLocaleString()} tokens)`;
}
function generateWhatThisMeans(tokens) {
  const ratio = tokens / AVG_SKILL_TOKENS;
  if (ratio < 0.5) return "Low overhead \u2014 the AI loads this context quickly and cheaply. No action needed.";
  if (ratio < 1.2) return "Bigger skills cost more per invocation and leave less room for conversation. Smaller skills respond faster and cost less.";
  return "This skill is expensive to load on every turn \u2014 every byte competes with your actual conversation for the context window. Trimming it saves real money and improves response speed.";
}
function sizeBar(tokens) {
  const maxTokens = 8e4;
  const barWidth = 30;
  const fill = Math.min(Math.round(tokens / maxTokens * barWidth), barWidth);
  const avgPos = Math.min(Math.round(AVG_SKILL_TOKENS / maxTokens * barWidth), barWidth - 1);
  const bar = "\u2591".repeat(fill) + "\u2588" + "\u2591".repeat(Math.max(barWidth - fill - 1, 0));
  const marker = " ".repeat(avgPos) + "\u25B2";
  return `[${bar}]
 [${marker} avg]`;
}
function analyzeSkill(dir) {
  if (!existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }
  if (!statSync(dir).isDirectory()) {
    throw new Error(`Not a directory: ${dir}`);
  }
  const files = discoverSkillFiles(dir);
  const manifest = loadManifest(files);
  const context = {
    skillDir: dir,
    files,
    skillManifest: manifest
  };
  const allFindings = [];
  for (const rule of rules) {
    const ruleFindings = rule.analyze(context);
    allFindings.push(...ruleFindings);
  }
  const estimatedTokens = estimateTokens(files);
  const efficiencyScore = calculateEfficiencyScore(allFindings, estimatedTokens);
  const grade = calculateGrade(efficiencyScore);
  const summary = {
    total_findings: allFindings.length,
    estimated_tokens_per_invocation: estimatedTokens,
    efficiency_score: efficiencyScore
  };
  return {
    one_liner: generateOneLiner(grade, estimatedTokens, allFindings.length),
    grade,
    estimated_tokens: estimatedTokens,
    comparison: generateComparison(estimatedTokens),
    cost_per_use: estimateCost(estimatedTokens),
    what_this_means: generateWhatThisMeans(estimatedTokens),
    findings: allFindings,
    summary
  };
}
function gradeColor(grade) {
  switch (grade) {
    case "A":
      return "\x1B[32m";
    // green
    case "B":
      return "\x1B[33m";
    // yellow
    case "C":
      return "\x1B[33m\x1B[1m";
    // bold yellow
    case "D":
      return "\x1B[31m\x1B[1m";
  }
}
function severityIcon(sev) {
  switch (sev) {
    case "high":
      return "\x1B[31m\u25CF\x1B[0m";
    case "medium":
      return "\x1B[33m\u25CF\x1B[0m";
    case "low":
      return "\x1B[36m\u25CF\x1B[0m";
    default:
      return "\x1B[2m\u25CF\x1B[0m";
  }
}
function wrapText(text, width) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > width && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current.length === 0 ? word : `${current} ${word}`;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
function renderSkillReport(report) {
  const bold = "\x1B[1m";
  const dim = "\x1B[2m";
  const reset = "\x1B[0m";
  const cyan = "\x1B[36m";
  const gc = gradeColor(report.grade);
  const lines = [];
  lines.push("");
  lines.push(`${cyan}${bold}  SKILL TOKEN ANALYSIS${reset}`);
  lines.push(`${dim}  ${"\u2500".repeat(50)}${reset}`);
  lines.push("");
  lines.push(`  ${bold}"${report.one_liner}"${reset}`);
  lines.push("");
  lines.push(`  Grade:  ${gc}${bold}${report.grade}${reset}  (${report.summary.efficiency_score}/100)`);
  lines.push(`  Size:   ${report.comparison}`);
  lines.push("");
  lines.push(`  ${sizeBar(report.estimated_tokens)}`);
  lines.push("");
  lines.push(`  Context load:  ${report.cost_per_use.sonnet_context_load} (Sonnet)  |  ${report.cost_per_use.opus_context_load} (Opus)`);
  lines.push(`  ${dim}${report.cost_per_use.pricing_note}${reset}`);
  lines.push("");
  if (report.findings.length > 0) {
    lines.push(`  ${bold}Findings (${report.findings.length}):${reset}`);
    for (const f of report.findings) {
      const icon = severityIcon(f.severity);
      lines.push(`  ${icon} ${bold}${f.rule}${reset} [${f.severity}]`);
      for (const ln of wrapText(f.description, 76)) {
        lines.push(`    ${dim}${ln}${reset}`);
      }
      if (f.remediation) {
        for (const remediationLine of f.remediation.split("\n")) {
          for (const ln of wrapText(`Fix: ${remediationLine}`, 76)) {
            lines.push(`    ${dim}${ln}${reset}`);
          }
        }
      }
      lines.push("");
    }
  } else {
    lines.push(`  ${dim}No findings. Structure looks clean.${reset}`);
    lines.push("");
  }
  lines.push(`  ${dim}${report.what_this_means}${reset}`);
  lines.push("");
  return lines.join("\n");
}

// src/discovery.ts
import { readdir, stat } from "fs/promises";
import { join as join2, basename } from "path";
import { homedir } from "os";
function getDefaultClaudeDir() {
  return join2(homedir(), ".claude");
}
async function detectClaudeDirs() {
  const home = homedir();
  const dirs = [];
  try {
    const entries = await readdir(home, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".claude" || entry.name.startsWith(".claude-")) {
        const projectsDir = join2(home, entry.name, "projects");
        try {
          const s = await stat(projectsDir);
          if (s.isDirectory()) {
            dirs.push(join2(home, entry.name));
          }
        } catch {
        }
      }
    }
  } catch {
  }
  return dirs;
}
async function discoverFiles(options) {
  let claudeDirs;
  if (options.claudeDir) {
    claudeDirs = [options.claudeDir];
  } else {
    claudeDirs = await detectClaudeDirs();
    if (claudeDirs.length === 0) {
      claudeDirs = [getDefaultClaudeDir()];
    }
  }
  const cutoffDate = new Date(Date.now() - options.days * 24 * 60 * 60 * 1e3);
  const files = [];
  const seenSessionIds = /* @__PURE__ */ new Set();
  for (const claudeDir of claudeDirs) {
    const projectsDir = join2(claudeDir, "projects");
    const dirLabel = basename(claudeDir);
    try {
      const projectDirs = await readdir(projectsDir, { withFileTypes: true });
      for (const projectDir of projectDirs) {
        if (!projectDir.isDirectory()) continue;
        const projectPath = join2(projectsDir, projectDir.name);
        if (options.project) {
          const normalizedProject = options.project.replace(/\/$/, "");
          const normalizedDirName = projectDir.name;
          if (!normalizedDirName.includes(normalizedProject) && !normalizedProject.includes(normalizedDirName)) {
            continue;
          }
        }
        const mainFiles = await findJsonlFiles(projectPath, projectDir.name, cutoffDate, dirLabel);
        for (const f of mainFiles) {
          if (!seenSessionIds.has(f.sessionId)) {
            seenSessionIds.add(f.sessionId);
            files.push(f);
          }
        }
        try {
          const entries = await readdir(projectPath, { withFileTypes: true });
          const subdirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
          if (subdirNames.length > 0) {
            const subagentResults = await Promise.allSettled(
              subdirNames.map(
                (dirName) => findJsonlFiles(join2(projectPath, dirName, "subagents"), projectDir.name, cutoffDate, dirLabel)
              )
            );
            for (const result of subagentResults) {
              if (result.status === "fulfilled") {
                for (const f of result.value) {
                  if (!seenSessionIds.has(f.sessionId)) {
                    seenSessionIds.add(f.sessionId);
                    files.push(f);
                  }
                }
              }
            }
          }
        } catch {
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  files.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  return files;
}
async function findJsonlFiles(dirPath, projectName, cutoffDate, sourceDir) {
  const files = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const filePath = join2(dirPath, entry.name);
      const stats = await stat(filePath);
      if (stats.mtime < cutoffDate) continue;
      const sessionId = basename(entry.name, ".jsonl");
      files.push({
        path: filePath,
        projectPath: dirPath,
        projectName,
        sessionId,
        modifiedAt: stats.mtime,
        size: stats.size,
        sourceDir
      });
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  return files;
}
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function logDiscoverySummary(files, verbose) {
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const projects = new Set(files.map((f) => f.projectName));
  const sources = new Set(files.map((f) => f.sourceDir));
  if (verbose) {
    console.error(`Discovered ${files.length} session files across ${projects.size} projects`);
    console.error(`Total size: ${formatSize(totalSize)}`);
    if (sources.size > 1) {
      console.error(`Sources: ${[...sources].join(", ")}`);
    }
  }
}

// src/recommendation.ts
function fmt(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}
function fmtWhen(iso) {
  if (!iso) return "unknown date";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = months[d.getMonth()] ?? "?";
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${mon} ${day} at ${h}:${m}`;
}
function cleanPrompt(text) {
  let cleaned = text;
  const nameMatch = cleaned.match(/<command-name>([^<]+)<\/command-name>/);
  let argsMatch = cleaned.match(/<command-args>([^]*?)<\/command-args>/);
  if (!argsMatch && cleaned.includes("<command-args>")) {
    argsMatch = cleaned.match(/<command-args>([^]+)/);
  }
  if (nameMatch && argsMatch) {
    const name = nameMatch[1]?.trim() ?? "";
    const args = argsMatch[1]?.trim() ?? "";
    cleaned = args ? `${name} ${args}` : name;
  }
  cleaned = cleaned.replace(/<task-notification>[^]*?<\/task-notification>/g, "").replace(/<system-reminder>[^]*?<\/system-reminder>/g, "").replace(/<[^>]+>/g, "").replace(/\s{2,}/g, " ").trim();
  return cleaned;
}
function fmtPrompt(prompt, maxLen = 200) {
  if (!prompt) return "";
  const cleaned = cleanPrompt(prompt.replace(/\n/g, " "));
  if (cleaned.length <= maxLen) return cleaned;
  const truncated = cleaned.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.6 ? truncated.slice(0, lastSpace) : truncated) + "...";
}
function extractContextSnowball(result) {
  const ev = result.evidence;
  const worst = ev?.worstSessions?.[0];
  const count = ev?.sessionsWithSnowball ?? "?";
  const total = ev?.totalSessions ?? "?";
  const rate = ev?.snowballRate ?? "?";
  const avgTurn = ev?.avgInflectionTurn ?? "?";
  const headline = `Your context window ballooned without /compact in ${count} of ${total} sessions (${rate}%).`;
  let evidenceText;
  if (worst) {
    const when = fmtWhen(worst.startedAt || worst.date);
    const prompt = fmtPrompt(worst.firstPrompt);
    evidenceText = `Worst: ${worst.project} on ${when} \u2014 context grew ${worst.growthMultiplier}x by message ${worst.inflectionTurn}, wasting ${fmt(worst.excessTokens)} tokens.`;
    if (prompt) evidenceText += `
  You were working on: "${prompt}"`;
  } else {
    evidenceText = `Across ${count} affected sessions, context expanded beyond 2.5x its starting size.`;
  }
  const consequence = `Every message in a snowballed session re-sends the entire conversation history, compounding token cost.`;
  const turnHint = typeof avgTurn === "number" ? Math.max(1, Math.round(avgTurn) - 2) : 10;
  const action = worst ? `In ${worst.project}, your context typically snowballs around message ${worst.inflectionTurn}. Run /compact around message ${turnHint} \u2014 before it grows, not after. When switching to a different task, run /clear instead.` : `Run /compact around message ${turnHint} \u2014 before context grows, not after. When switching tasks, run /clear to start fresh.`;
  return { headline, evidence: evidenceText, consequence, action };
}
function extractModelSelection(result) {
  const ev = result.evidence;
  const worst = ev?.examples?.[0];
  const count = ev?.overkillSessions ?? "?";
  const rate = ev?.overkillRate ?? "?";
  const headline = `You used Opus for ${count} sessions (${rate}%) where Sonnet would have produced the same result.`;
  let evidenceText;
  if (worst) {
    const when = fmtWhen(worst.startedAt || worst.date);
    const prompt = fmtPrompt(worst.firstPrompt);
    evidenceText = `Example: ${worst.project} on ${when} \u2014 ${worst.toolCount} tool uses, ${worst.complexity} complexity. ${worst.suggestedModel.replace("claude-", "")} was sufficient.`;
    if (prompt) evidenceText += `
  Task: "${prompt}"`;
  } else {
    evidenceText = `These sessions had simple tasks with few tool uses that don't require Opus-level reasoning.`;
  }
  const consequence = `Opus processes ~5x more tokens per task than Sonnet for identical work on simple tasks.`;
  const action = worst ? `Your ${count} flagged sessions were all ${worst.complexity} complexity with ${worst.toolCount} or fewer tool uses \u2014 textbook Sonnet territory. Run /model sonnet at session start. Only switch to Opus for multi-file refactors or architectural design.` : `Run /model sonnet at the start of simple sessions. Switch to Opus only for architecture, complex debugging, or multi-file refactors.`;
  return { headline, evidence: evidenceText, consequence, action };
}
function extractFileReadWaste(result) {
  const ev = result.evidence;
  const worst = ev?.topDuplicates?.[0];
  const second = ev?.topDuplicates?.[1];
  const dupes = ev?.duplicateReads ?? 0;
  const sessions = ev?.sessionsWithWaste ?? "?";
  const headline = `Claude re-read the same files ${dupes} times across ${sessions} sessions without any changes.`;
  let evidenceText;
  if (worst) {
    const when = fmtWhen(worst.startedAt);
    evidenceText = `Worst offender: ${worst.file} in ${worst.project} (on ${when}) \u2014 read ${worst.count}x, wasting ~${fmt(worst.tokens)} tokens.`;
    const prompt = fmtPrompt(worst.firstPrompt);
    if (prompt) evidenceText += `
  Session task: "${prompt}"`;
    if (second) {
      evidenceText += `
  Also: ${second.file} in ${second.project} \u2014 read ${second.count}x.`;
    }
  } else {
    evidenceText = `Duplicate file reads inject the same content into context repeatedly for zero new information.`;
  }
  const consequence = `Each duplicate read adds 500-5,000 tokens to your context and raises the floor for all subsequent messages.`;
  const action = worst ? `In ${worst.project}, ${worst.file} was re-read ${worst.count} times. After Claude reads a file, say "in the ${worst.file} you already read" instead of asking it to re-read. For ${second ? `${second.file} too` : "other frequently-read files"} \u2014 paste the relevant snippet into your message instead of triggering another full read.` : `Reference files by name ("in the auth.ts you already read") instead of asking Claude to re-read them.`;
  return { headline, evidence: evidenceText, consequence, action };
}
function extractBashOutputBloat(result) {
  const ev = result.evidence;
  const worst = ev?.examples?.[0];
  const sessions = ev?.sessionsWithBloat ?? "?";
  const rate = ev?.bloatRate ?? "?";
  const headline = `${sessions} sessions (${rate}%) ran bash commands that dumped excessive output into context.`;
  let evidenceText;
  if (worst) {
    const when = fmtWhen(worst.startedAt);
    evidenceText = `Example: \`${worst.command}\` in ${worst.project} on ${when} \u2014 ${worst.category}.`;
    const prompt = fmtPrompt(worst.firstPrompt);
    if (prompt) evidenceText += `
  You were working on: "${prompt}"`;
  } else {
    evidenceText = `Commands like git log, find, and npm list produced thousands of lines of output that entered context permanently.`;
  }
  const consequence = `Bash output stays in the conversation for the entire session \u2014 one bad command can inject more tokens than 20 file reads.`;
  const action = worst ? `That \`${worst.command}\` command was flagged as ${worst.category}. Next time, add a limit: pipe output through | head -30 or | grep "pattern" to only bring relevant lines into context. For test output, use npm test 2>&1 | tail -20.` : `Add limits: git log -n 10 --oneline, find . | head -20. Pipe through grep or head to filter before it enters context.`;
  return { headline, evidence: evidenceText, consequence, action };
}
function extractVaguePrompts(result) {
  const ev = result.evidence;
  const worst = ev?.examples?.[0];
  const count = ev?.sessionsWithVaguePrompts ?? "?";
  const rate = ev?.vagueRate ?? "?";
  const clarifications = ev?.clarificationRounds ?? 0;
  const headline = `${count} sessions (${rate}%) started with prompts too vague for Claude to act on directly.`;
  let evidenceText;
  if (worst) {
    const prompt = fmtPrompt(worst.prompt, 200);
    evidenceText = `Example: "${prompt}" in ${worst.project} \u2014 ${worst.wordCount} words, flagged as: ${worst.vagueReason}.`;
  } else {
    evidenceText = `Vague prompts force Claude into exploration loops \u2014 reading files and asking questions before doing real work.`;
  }
  const consequence = `Vague prompts trigger ${clarifications} clarification rounds total, each adding extra messages and context before any productive work begins.`;
  const action = worst ? `Rewrite "${worst.prompt.slice(0, 40).replace(/\n/g, " ")}..." by adding the file path and function name. For example: "Fix the ${worst.vagueReason.includes("verb") ? worst.vagueReason.match(/fix|update|change/i)?.[0] ?? "issue" : "issue"} in src/[relevant-file].ts" \u2014 this lets Claude act on the first message instead of asking questions.` : `Include the file path and what you want changed: "Fix the null check in src/auth.ts line 45" instead of "fix the bug".`;
  return { headline, evidence: evidenceText, consequence, action };
}
function extractSessionTiming(result) {
  const ev = result.evidence;
  const peakHours = ev?.peakHours ?? [];
  const lateNight = ev?.lateNightSessions ?? 0;
  const highIntensity = ev?.highIntensityWindows ?? 0;
  const total = ev?.totalSessions ?? "?";
  const peakStr = peakHours.map((h) => `${h}:00`).join(", ");
  const headline = lateNight > 0 || highIntensity > 3 ? `Your session timing shows inefficiency: ${lateNight} late-night sessions and ${highIntensity} high-intensity hours.` : `Session timing patterns across ${total} sessions show room for optimization.`;
  const evidenceText = `Peak hours: ${peakStr || "unknown"} UTC. Late-night sessions (10PM-6AM): ${lateNight} of ${total}. High-intensity windows: ${highIntensity} hours with >20% of sessions.`;
  const consequence = `Long sessions compound context \u2014 a 60-minute session often uses 3-4x more tokens per useful output than a 20-minute one.`;
  const action = peakHours.length > 0 ? `Your peak usage is at ${peakStr} UTC. Start fresh sessions at the beginning of your work block to get the full rate limit window. Keep sessions under 30 minutes \u2014 run /compact when you pass the halfway mark.` : `Keep sessions under 30 minutes. When context grows past 50%, run /compact. Stagger sessions across hours to avoid rate limits.`;
  return { headline, evidence: evidenceText, consequence, action };
}
function extractSubagentOpportunity(result) {
  const ev = result.evidence;
  const worst = ev?.examples?.[0];
  const count = ev?.sessionsWithOpportunity ?? "?";
  const rate = ev?.opportunityRate ?? "?";
  const headline = `${count} sessions (${rate}%) had Claude reading files one-by-one in the main context instead of using subagents.`;
  let evidenceText;
  if (worst) {
    const when = fmtWhen(worst.startedAt || worst.date);
    const prompt = fmtPrompt(worst.firstPrompt);
    evidenceText = `Worst: ${worst.project} on ${when} \u2014 Claude read ${worst.chainLength} files sequentially, dumping all ${worst.filesExplored} file contents into your main conversation.`;
    if (prompt) evidenceText += `
  Task: "${prompt}"`;
  } else {
    evidenceText = `Long exploration chains add file contents to your main context permanently.`;
  }
  const consequence = `Every file read stays in context for the rest of the session, compounding token cost on every subsequent message.`;
  const action = worst ? `That ${worst.chainLength}-file exploration in ${worst.project} could have been a single subagent call. Next time you need Claude to explore multiple files, say: "Use a subagent to find all files related to [topic] and summarize the relevant code." The subagent reads files in isolation \u2014 only the summary enters your context.` : `Prefix exploration requests with "Use a subagent to explore..." \u2014 reads happen in isolation and only the summary enters your main context.`;
  return { headline, evidence: evidenceText, consequence, action };
}
function extractClaudeMdOverhead(result) {
  const ev = result.evidence;
  const worst = ev?.worstOffenders?.[0];
  const projectCount = ev?.projectsWithIssues ?? "?";
  const headline = `${projectCount} project(s) have oversized CLAUDE.md files that add overhead to every message.`;
  const evidenceText = worst ? `Heaviest: ${worst.project} at ${worst.tokenCount.toLocaleString()} tokens (~${Math.round(worst.sizeBytes / 1024)}KB), ${worst.sessionsAffected} sessions affected. Issues: ${worst.issues.slice(0, 2).join(", ") || "oversized"}.` : `Large CLAUDE.md files inject thousands of tokens into every API call, even when the content is irrelevant.`;
  const consequence = `CLAUDE.md content is part of the system prompt \u2014 every token in it is charged on every single message of every conversation.`;
  const action = worst ? `${worst.project}/CLAUDE.md is ${worst.tokenCount.toLocaleString()} tokens \u2014 ${Math.round(worst.tokenCount / 1e3)}x the recommended 1K token budget. ${worst.issues.length > 0 ? `Specific issues: ${worst.issues.slice(0, 2).join(", ")}.` : ""} Run tokenomics --fix to review and trim it automatically.` : `Trim CLAUDE.md to under 1,000 tokens. Remove config duplication and move procedures to on-demand instruction files. Run tokenomics --fix to review.`;
  return { headline, evidence: evidenceText, consequence, action };
}
function extractMcpToolTax(result) {
  const ev = result.evidence;
  const rarelyUsed = ev?.rarelyUsedServers ?? [];
  const neverUsed = ev?.neverUsedServers ?? [];
  const worst = rarelyUsed[0];
  const neverList = neverUsed.slice(0, 3).join(", ");
  const headline = neverUsed.length > 0 ? `${neverUsed.length} MCP server(s) were loaded every session but never used: ${neverList}.` : rarelyUsed.length > 0 ? `${rarelyUsed.length} MCP server(s) were used in fewer than 5% of sessions.` : `MCP server overhead detected.`;
  const evidenceText = worst ? `Example: "${worst.name}" \u2014 used in ${worst.sessionsUsed}/${worst.totalSessions} sessions (${worst.usageRate}%). ${neverUsed.length > 0 ? `Never used: ${neverList}.` : ""}` : `Every loaded server injects tool definitions into each API request, whether or not those tools are called.`;
  const consequence = `Each MCP server adds 100-500 tokens of overhead on every message \u2014 a fixed tax across all sessions.`;
  const action = neverUsed.length > 0 ? `${neverList} ${neverUsed.length === 1 ? "was" : "were"} loaded in every session but never called. Remove ${neverUsed.length === 1 ? "it" : "them"} from your ~/.claude/settings.json under mcpServers. Keep servers you use daily; enable rarely-used ones per-project only.` : `Remove never-used servers from your Claude config. Move rarely-used ones to project-level config. Run tokenomics --fix to auto-remove unused servers.`;
  return { headline, evidence: evidenceText, consequence, action };
}
function extractGeneric(result) {
  return {
    headline: result.title || result.detector,
    evidence: result.remediation?.problem?.slice(0, 200) || "No specific evidence available.",
    consequence: (() => {
      const s = result.remediation?.whyItMatters?.split(".")[0];
      return s ? `${s}.` : "This pattern wastes tokens across your sessions.";
    })(),
    action: result.remediation?.specificQuickWin?.split("\n")[0] || "Review the detailed report for specific actions."
  };
}
var EXTRACTORS = {
  "context-snowball": extractContextSnowball,
  "model-selection": extractModelSelection,
  "file-read-waste": extractFileReadWaste,
  "bash-output-bloat": extractBashOutputBloat,
  "vague-prompts": extractVaguePrompts,
  "session-timing": extractSessionTiming,
  "subagent-opportunity": extractSubagentOpportunity,
  "claude-md-overhead": extractClaudeMdOverhead,
  "mcp-tool-tax": extractMcpToolTax
};
function extractHumanReadableBlock(result) {
  const extractor = EXTRACTORS[result.detector];
  let parts;
  try {
    parts = extractor ? extractor(result) : extractGeneric(result);
  } catch {
    parts = extractGeneric(result);
  }
  return {
    detector: result.detector,
    headline: parts.headline,
    evidence: parts.evidence,
    consequence: parts.consequence,
    action: parts.action
  };
}
function severityAnsi(severity) {
  switch (severity) {
    case "high":
      return { icon: "\x1B[31m\u25CF\x1B[0m", color: "\x1B[31m", label: "HIGH" };
    case "medium":
      return { icon: "\x1B[33m\u25CF\x1B[0m", color: "\x1B[33m", label: "MED" };
    case "low":
      return { icon: "\x1B[34m\u25CF\x1B[0m", color: "\x1B[34m", label: "LOW" };
  }
}
function wrap(text, width, indent) {
  return text.split("\n").map((line) => {
    if (line.length <= width) return `${indent}${line}`;
    const words = line.split(" ");
    const result = [];
    let current = "";
    for (const word of words) {
      if (current.length + word.length + 1 > width) {
        result.push(`${indent}${current}`);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) result.push(`${indent}${current}`);
    return result.join("\n");
  }).join("\n");
}
function renderTerminalBlock(block, severity) {
  const sev = severityAnsi(severity);
  const bold = "\x1B[1m";
  const dim = "\x1B[2m";
  const reset = "\x1B[0m";
  const cyan = "\x1B[36m";
  const lines = [];
  lines.push(`  ${"\u2500".repeat(58)}`);
  lines.push(`  ${sev.icon} ${sev.color}${bold}${wrap(block.headline, 56, "")}${reset}`);
  lines.push("");
  lines.push(`  ${dim}Evidence:${reset}`);
  lines.push(wrap(block.evidence, 56, "    "));
  lines.push("");
  lines.push(`  ${dim}Impact:${reset}    ${block.consequence}`);
  lines.push("");
  lines.push(`  ${cyan}Action:${reset}`);
  lines.push(wrap(block.action, 56, "    "));
  lines.push("");
  return lines.join("\n");
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function severityHtml(severity) {
  switch (severity) {
    case "high":
      return { color: "#ff4d6a", label: "HIGH" };
    case "medium":
      return { color: "#ffbe2e", label: "MODERATE" };
    case "low":
      return { color: "#22d3ee", label: "LOW" };
  }
}
function renderHtmlBlock(block, severity) {
  const sev = severityHtml(severity);
  const evidenceHtml = escapeHtml(block.evidence).replace(/\n/g, "<br>");
  const actionHtml = escapeHtml(block.action).replace(/\n/g, "<br>");
  return `<details class="finding-card" data-severity="${severity}" data-detector="${escapeHtml(block.detector)}" open>
  <summary class="finding-card-header">
    <span class="sev-indicator" style="background:${sev.color};box-shadow:0 0 8px ${sev.color}40"></span>
    <span class="finding-card-title" style="color:${sev.color}">${escapeHtml(block.headline)}</span>
    <svg class="finding-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
  </summary>
  <div class="finding-card-body">
    <div class="finding-card-section">
      <span class="finding-card-label">Evidence</span>
      <p class="finding-card-text">${evidenceHtml}</p>
    </div>
    <div class="finding-card-section">
      <span class="finding-card-label">Why it matters</span>
      <p class="finding-card-text">${escapeHtml(block.consequence)}</p>
    </div>
    <div class="finding-card-section finding-card-action">
      <span class="finding-card-label">What to do</span>
      <p class="finding-card-text">${actionHtml}</p>
    </div>
  </div>
</details>`;
}

// src/parser.ts
import { createReadStream } from "fs";
import { createInterface } from "readline";
async function parseSessionFile(file) {
  const records = [];
  try {
    const rl = createInterface({
      input: createReadStream(file.path, "utf-8"),
      crlfDelay: Infinity
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        records.push(record);
      } catch {
      }
    }
  } catch (error) {
    return null;
  }
  return buildSessionData(records, file);
}
function buildSessionData(records, file) {
  if (records.length === 0) return null;
  const sessionId = records[0]?.sessionId ?? file.sessionId;
  const cwd = records[0]?.cwd ?? "";
  const slug = findSlug(records) ?? file.sessionId.slice(0, 8);
  const messages = [];
  const toolUses = [];
  const toolResults = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;
  let compactCount = 0;
  let startedAt = "";
  let endedAt = "";
  let model = "";
  for (const record of records) {
    if (record.timestamp) {
      if (!startedAt || record.timestamp < startedAt) {
        startedAt = record.timestamp;
      }
      if (!endedAt || record.timestamp > endedAt) {
        endedAt = record.timestamp;
      }
    }
    if (record.type === "user" && record.message) {
      const msg = record.message;
      if (msg.type === "tool_result" || msg.content && typeof msg.content !== "string") {
        const content = msg.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (typeof item === "object" && item !== null && "tool_use_id" in item) {
              toolResults.push({
                tool_use_id: item.tool_use_id,
                content: typeof item.content === "string" ? item.content : JSON.stringify(item.content),
                is_error: item.is_error ?? false,
                timestamp: record.timestamp ?? ""
              });
            }
          }
        }
      }
      const contentStr = extractContentString(msg.content);
      if (contentStr) {
        messages.push({
          role: "user",
          content: contentStr,
          timestamp: record.timestamp ?? ""
        });
      }
    }
    if (record.type === "assistant" && record.message) {
      const msg = record.message;
      if (msg.model && !model) {
        model = msg.model;
      }
      if (msg.usage) {
        totalInputTokens += msg.usage.input_tokens ?? 0;
        totalOutputTokens += msg.usage.output_tokens ?? 0;
        totalCacheReadTokens += msg.usage.cache_read_input_tokens ?? 0;
        totalCacheCreationTokens += msg.usage.cache_creation_input_tokens ?? 0;
      }
      const content = msg.content;
      if (Array.isArray(content)) {
        let textContent = "";
        for (const item of content) {
          if (typeof item === "object" && item !== null) {
            if (item.type === "tool_use") {
              toolUses.push({
                id: item.id,
                name: item.name,
                input: item.input,
                timestamp: record.timestamp ?? ""
              });
            } else if (item.type === "text" && "text" in item) {
              textContent += item.text;
            }
          }
        }
        if (textContent.trim()) {
          messages.push({
            role: "assistant",
            content: textContent.trim(),
            usage: msg.usage ? {
              inputTokens: msg.usage.input_tokens ?? 0,
              outputTokens: msg.usage.output_tokens ?? 0,
              cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
              cacheCreationTokens: msg.usage.cache_creation_input_tokens ?? 0
            } : void 0,
            timestamp: record.timestamp ?? ""
          });
        }
      } else if (typeof content === "string" && content.trim()) {
        messages.push({
          role: "assistant",
          content: content.trim(),
          usage: msg.usage ? {
            inputTokens: msg.usage.input_tokens ?? 0,
            outputTokens: msg.usage.output_tokens ?? 0,
            cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
            cacheCreationTokens: msg.usage.cache_creation_input_tokens ?? 0
          } : void 0,
          timestamp: record.timestamp ?? ""
        });
      }
    }
  }
  for (const tu of toolUses) {
    if (tu.name === "compact" || tu.name === "Bash" && compactCount === 0) {
      if (tu.name === "Bash") {
        const cmd = tu.input.command ?? tu.input.cmd;
        if (typeof cmd === "string" && cmd.includes("compact")) {
          compactCount++;
        }
      } else {
        compactCount++;
      }
    }
  }
  const turnCount = messages.filter((m) => m.role === "user").length;
  return {
    id: sessionId,
    project: extractProjectName(cwd),
    projectPath: cwd,
    slug,
    model: model || "unknown",
    messages,
    toolUses,
    toolResults,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheCreationTokens,
    turnCount,
    compactUsed: compactCount > 0,
    compactCount,
    startedAt,
    endedAt,
    sourceFile: file.path
  };
}
function findSlug(records) {
  for (const record of records) {
    if (record.slug) return record.slug;
  }
  return null;
}
function extractContentString(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter(
      (item) => typeof item === "object" && item !== null && item.type === "text"
    ).map((item) => item.text).join("\n");
  }
  return "";
}
function extractProjectName(cwd) {
  if (!cwd) return "unknown";
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}
function getContextTurns(session) {
  const turns = [];
  for (const msg of session.messages) {
    if (msg.usage) {
      turns.push({
        turnIndex: turns.length,
        inputTokens: msg.usage.inputTokens,
        outputTokens: msg.usage.outputTokens,
        cacheReadTokens: msg.usage.cacheReadTokens,
        cacheCreationTokens: msg.usage.cacheCreationTokens,
        totalContext: msg.usage.inputTokens + msg.usage.cacheReadTokens + Math.floor(msg.usage.cacheCreationTokens / 2),
        // Cache creation is amortized
        role: msg.role,
        timestamp: msg.timestamp
      });
    }
  }
  return turns;
}
async function parseSessionFiles(files) {
  const sessions = [];
  for (const file of files) {
    const session = await parseSessionFile(file);
    if (session) {
      sessions.push(session);
    }
  }
  return sessions;
}

// src/detectors/context-snowball.ts
var MIN_CONTEXT_THRESHOLD = 500;
var SNOWBALL_MULTIPLIER = 2.5;
var MIN_TURNS_FOR_ANALYSIS = 3;
function detectContextSnowball(sessions) {
  if (sessions.length === 0) return null;
  const snowballs = [];
  let totalCompactUsed = 0;
  for (const session of sessions) {
    const turns = getContextTurns(session);
    const substantialTurns = turns.filter((t) => t.totalContext >= MIN_CONTEXT_THRESHOLD);
    if (substantialTurns.length < MIN_TURNS_FOR_ANALYSIS) continue;
    if (session.compactUsed) totalCompactUsed++;
    const firstTurns = substantialTurns.slice(0, 3);
    const baseline = median(firstTurns.map((t) => t.totalContext));
    let inflectionIdx = -1;
    for (let i = 0; i < substantialTurns.length; i++) {
      if (substantialTurns[i].totalContext > SNOWBALL_MULTIPLIER * baseline) {
        inflectionIdx = i;
        break;
      }
    }
    if (inflectionIdx === -1) continue;
    const peak = Math.max(...substantialTurns.map((t) => t.totalContext));
    const growthMultiplier = peak / baseline;
    let excessTokens = 0;
    for (let i = inflectionIdx; i < substantialTurns.length; i++) {
      const turn = substantialTurns[i];
      const reasonableThreshold = 2 * baseline;
      if (turn.totalContext > reasonableThreshold) {
        excessTokens += turn.totalContext - reasonableThreshold;
      }
    }
    snowballs.push({
      session,
      inflectionTurn: inflectionIdx,
      growthMultiplier,
      excessTokens,
      baseline,
      peak
    });
  }
  if (snowballs.length === 0) return null;
  const snowballRate = snowballs.length / sessions.length;
  const compactUsedRate = totalCompactUsed / sessions.length;
  const avgInflectionTurn = snowballs.reduce((sum, s) => sum + s.inflectionTurn, 0) / snowballs.length;
  const avgGrowthMultiplier = snowballs.reduce((sum, s) => sum + s.growthMultiplier, 0) / snowballs.length;
  const totalExcessTokens = snowballs.reduce((sum, s) => sum + s.excessTokens, 0);
  const worstSessions = snowballs.sort((a, b) => b.excessTokens - a.excessTokens).slice(0, 5).map((s) => ({
    slug: s.session.slug,
    project: s.session.project,
    date: s.session.startedAt.split("T")[0] ?? "",
    startedAt: s.session.startedAt,
    firstPrompt: s.session.messages.find((m) => m.role === "user")?.content?.slice(0, 300) ?? "",
    inflectionTurn: s.inflectionTurn,
    growthMultiplier: Math.round(s.growthMultiplier * 10) / 10,
    excessTokens: s.excessTokens
  }));
  const totalTokens = sessions.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreationTokens,
    0
  );
  const savingsPercent = totalTokens > 0 ? Math.round(totalExcessTokens / totalTokens * 100) : 0;
  let severity;
  if (snowballRate > 0.5 && compactUsedRate < 0.1) {
    severity = "high";
  } else if (snowballRate > 0.3 || snowballRate > 0.2 && compactUsedRate < 0.05) {
    severity = "medium";
  } else {
    severity = "low";
  }
  const confidence = Math.min(0.95, 0.5 + snowballs.length * 0.05 + (1 - compactUsedRate) * 0.2);
  const evidence = {
    sessionsWithSnowball: snowballs.length,
    totalSessions: sessions.length,
    snowballRate: Math.round(snowballRate * 100),
    avgInflectionTurn: Math.round(avgInflectionTurn * 10) / 10,
    avgGrowthMultiplier: Math.round(avgGrowthMultiplier * 10) / 10,
    worstSessions,
    compactUsedRate: Math.round(compactUsedRate * 100),
    potentialSavingsPercent: savingsPercent
  };
  const remediation = buildSnowballRemediation(evidence, totalExcessTokens);
  const byProject = /* @__PURE__ */ new Map();
  for (const s of evidence.worstSessions) {
    const list = byProject.get(s.project) ?? [];
    list.push(s);
    byProject.set(s.project, list);
  }
  const sessionBreakdown = [...byProject.entries()].map(([project, sessions2]) => {
    const rows = sessions2.map((s) => {
      const excess = s.excessTokens > 1e6 ? `${(s.excessTokens / 1e6).toFixed(1)}M` : `${Math.round(s.excessTokens / 1e3)}K`;
      return `  - **${s.project}** (${s.date}): grew **${s.growthMultiplier}x** from turn ${s.inflectionTurn}, wasted **${excess} tokens**`;
    }).join("\n");
    return `**${project}**
${rows}`;
  }).join("\n\n");
  return {
    detector: "context-snowball",
    title: "Context Snowball",
    severity,
    savingsPercent,
    savingsTokens: totalExcessTokens,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
    remediation,
    sessionBreakdown: sessionBreakdown || "_No specific sessions to call out._"
  };
}
function buildSnowballRemediation(evidence, totalExcessTokens) {
  const avgTurn = Math.round(evidence.avgInflectionTurn);
  const formattedExcess = totalExcessTokens > 1e6 ? `${(totalExcessTokens / 1e6).toFixed(1)}M` : `${Math.round(totalExcessTokens / 1e3)}K`;
  const projectCounts = /* @__PURE__ */ new Map();
  for (const s of evidence.worstSessions) {
    const existing = projectCounts.get(s.project);
    if (!existing || s.growthMultiplier > existing.maxGrowth) {
      projectCounts.set(s.project, {
        count: (existing?.count ?? 0) + 1,
        maxGrowth: s.growthMultiplier,
        worstSlug: s.slug
      });
    }
  }
  const projectLines = [...projectCounts.entries()].sort((a, b) => b[1].maxGrowth - a[1].maxGrowth).map(([proj, d]) => `**${proj}** (${d.maxGrowth}x growth)`).join("; ");
  const worst = evidence.worstSessions[0];
  const worstDesc = worst ? `**${worst.project}** grew ${worst.growthMultiplier}x starting at turn ${worst.inflectionTurn}` : "multiple sessions";
  return {
    problem: `In ${evidence.sessionsWithSnowball} of your ${evidence.totalSessions} sessions (${evidence.snowballRate}%), the context window grew unchecked \u2014 averaging ${evidence.avgGrowthMultiplier}x expansion after turn ${avgTurn}. Affected projects: ${projectLines || "multiple projects"}. Only ${evidence.compactUsedRate}% of sessions used /compact. The result: Claude re-reads the entire ballooning conversation on every turn, paying for stale tool outputs, old file contents, and resolved discussions.`,
    whyItMatters: `Your worst session: ${worstDesc}, wasting ${worst ? worst.excessTokens > 1e6 ? `${(worst.excessTokens / 1e6).toFixed(1)}M` : `${Math.round(worst.excessTokens / 1e3)}K` : "?"} tokens on redundant context. Across all affected sessions this totals ~${formattedExcess} excess tokens. The token usage compounds: each new turn in a snowballed session consumes more tokens than the last because the context floor keeps rising. Large contexts also make Claude more likely to lose track of earlier decisions \u2014 particularly noticeable in long **${evidence.worstSessions[0]?.project ?? "project"}** sessions where the original goal gets buried under tool outputs.`,
    steps: [
      {
        action: "Monitor context growth, then compact with a focus directive",
        howTo: "Check your context window usage (type /cost to see current token count and context percentage) at regular intervals \u2014 after finishing a bug fix, completing an exploration phase, or wrapping up any logical chunk of work. When you see context climbing past 50%, use your context compaction feature (type /compact followed by a focus topic) \u2014 e.g., `/compact Focus on the auth module changes and the failing test cases`. This tells Claude to summarize and drop stale content while preserving what you need. You can also set compaction instructions permanently in your CLAUDE.md file so Claude knows what to preserve automatically.",
        impact: `Context auto-compaction only fires at ~95% capacity \u2014 that's already very late. Manual compaction with a focus directive gives you control and keeps Claude on-track. Across your ${evidence.sessionsWithSnowball} affected sessions, this could reclaim ~${formattedExcess} tokens.`
      },
      {
        action: "Start fresh when switching to an unrelated task",
        howTo: "When you finish one task and want to start something completely different, don't carry the old context forward. First, name your session (type /rename followed by a descriptive name) so you can find it later. Then start a fresh session (type /clear to reset the context window) to begin the new task from scratch. If you ever need to return to the old work, resume a previous session (type /resume) to pick up exactly where you left off. Stale context from a previous task costs you tokens on every subsequent turn with zero benefit.",
        impact: "Starting fresh eliminates the entire prior context. The difference is large: a session at 100K context uses 5-10x more tokens per turn than one starting at 10K."
      },
      {
        action: "Front-load your opening prompt to prevent exploration buildup",
        howTo: 'Include file paths, function names, and the desired outcome in your first message. Instead of "fix the login bug," write "Fix the JWT expiry bug in src/auth/jwt.ts \u2014 validateToken() should return false on expired tokens, not throw. The failing test is in tests/auth.test.ts line 42." Claude can act immediately without reading files speculatively.',
        impact: `Fewer exploration turns means less accumulated context. Your sessions with snowball averaged ${Math.round(evidence.avgGrowthMultiplier)}x growth \u2014 specific opening prompts typically keep sessions under 2x.`
      }
    ],
    examples: [
      {
        label: "Targeted compaction",
        before: "Compacting without instructions \u2014 Claude summarizes everything generically and may lose the specific variable names or file paths you still need.",
        after: "Use your context compaction feature (type /compact followed by a focus topic) \u2014 e.g., `/compact Focus on the changes made to src/auth/ and the two failing test cases` \u2014 so Claude preserves exactly what matters for the next phase."
      },
      {
        label: "Task switching",
        before: 'Finish debugging auth, then immediately ask "now help me with the deployment pipeline" \u2014 Claude carries 80K tokens of auth context into a completely unrelated task.',
        after: 'Name your session (type /rename followed by a descriptive name like "auth-debug"), then start a fresh session (type /clear to reset the context window). You get a clean deployment session at 5K tokens instead of dragging 80K along. Resume the old session later if needed.'
      }
    ],
    quickWin: "Check your context window usage right now (type /cost to see current token count and context percentage) in any active session. If it's above 50%, use your context compaction feature (type /compact followed by a focus topic) \u2014 e.g., `/compact Focus on the feature you're currently building`. You'll cut context in half while keeping Claude aligned on what you're doing.",
    specificQuickWin: (() => {
      const worst2 = evidence.worstSessions[0];
      if (!worst2) return `Your context typically snowballs around turn ${avgTurn}. After each logical work unit, use your context compaction feature (type /compact followed by a focus topic). When switching tasks entirely, start a fresh session (type /clear to reset the context window). Check your usage regularly (type /cost to see current token count and context percentage).`;
      const second = evidence.worstSessions[1];
      return `Your context snowballed hardest in **${worst2.project}** \u2014 ${worst2.growthMultiplier}x growth from turn ${worst2.inflectionTurn}, wasting ${worst2.excessTokens > 1e6 ? `${(worst2.excessTokens / 1e6).toFixed(1)}M` : `${Math.round(worst2.excessTokens / 1e3)}K`} tokens. ${second ? `Same pattern in **${second.project}**: ${second.growthMultiplier}x growth. ` : ""}Use context compaction after completing a logical unit of work (finishing a bug fix, wrapping up an exploration phase) \u2014 not on a fixed schedule. Compacting mid-task loses relevant context.`;
    })(),
    effort: "quick"
  };
}
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// src/detectors/model-selection.ts
var MODEL_MULTIPLIER = {
  "opus": 5,
  // Opus processes tokens with more compute
  "sonnet": 1,
  "haiku": 0.2,
  // Haiku is the most token-efficient
  "unknown": 1
};
var SIMPLE_TOOLS = /* @__PURE__ */ new Set(["Read", "Edit", "Write", "Bash", "Glob", "Grep"]);
function analyzeComplexity(session) {
  const toolCount = session.toolUses.length;
  const toolNames = new Set(session.toolUses.map((t) => t.name));
  if (toolNames.has("Agent")) {
    return {
      complexity: "complex",
      suggestedModel: "claude-opus-4-6",
      reason: "Uses Agent tool"
    };
  }
  if (toolCount > 15) {
    return {
      complexity: "complex",
      suggestedModel: "claude-opus-4-6",
      reason: "Many operations"
    };
  }
  if (toolCount < 5) {
    const allSimple = [...toolNames].every((t) => SIMPLE_TOOLS.has(t));
    if (allSimple) {
      return {
        complexity: "simple",
        suggestedModel: "claude-sonnet-4-6",
        reason: "Few simple operations"
      };
    }
  }
  const readCount = session.toolUses.filter((t) => t.name === "Read").length;
  const globCount = session.toolUses.filter((t) => t.name === "Glob").length;
  if (readCount > 10 || globCount > 5) {
    return {
      complexity: "medium",
      suggestedModel: "claude-sonnet-4-6",
      reason: "Heavy exploration"
    };
  }
  return {
    complexity: "medium",
    suggestedModel: "claude-sonnet-4-6",
    reason: "Standard complexity"
  };
}
function getModelTier(model) {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("sonnet")) return "sonnet";
  if (lower.includes("haiku")) return "haiku";
  return "unknown";
}
function isOverkill(model, suggestedModel) {
  const modelTier = getModelTier(model);
  const suggestedTier = getModelTier(suggestedModel);
  const tierOrder = { haiku: 0, sonnet: 1, opus: 2, unknown: 3 };
  return tierOrder[modelTier] > tierOrder[suggestedTier];
}
function detectModelSelection(sessions) {
  if (sessions.length === 0) return null;
  const overkillSessions = [];
  for (const session of sessions) {
    if (getModelTier(session.model) === "unknown") continue;
    if (session.toolUses.length === 0 && session.totalInputTokens < 1e3) continue;
    const complexity = analyzeComplexity(session);
    if (isOverkill(session.model, complexity.suggestedModel)) {
      overkillSessions.push({ session, complexity });
    }
  }
  if (overkillSessions.length === 0) return null;
  const overkillRate = overkillSessions.length / sessions.length * 100;
  let wastedTokens = 0;
  const examples = [];
  for (const { session, complexity } of overkillSessions.slice(0, 10)) {
    const currentTier = getModelTier(session.model);
    const suggestedTier = getModelTier(complexity.suggestedModel);
    const currentMult = MODEL_MULTIPLIER[currentTier] ?? 1;
    const suggestedMult = MODEL_MULTIPLIER[suggestedTier] ?? 1;
    if (currentMult > suggestedMult) {
      const sessionTokens = session.totalInputTokens + session.totalOutputTokens;
      wastedTokens += Math.round(sessionTokens * (1 - suggestedMult / currentMult));
    }
    if (examples.length < 5) {
      examples.push({
        slug: session.slug,
        project: session.project,
        date: session.startedAt.split("T")[0] ?? "",
        startedAt: session.startedAt,
        firstPrompt: session.messages.find((m) => m.role === "user")?.content?.slice(0, 300) ?? "",
        model: session.model,
        toolCount: session.toolUses.length,
        suggestedModel: complexity.suggestedModel,
        complexity: complexity.complexity
      });
    }
  }
  const totalTokens = sessions.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreationTokens,
    0
  );
  const savingsPercent = totalTokens > 0 ? Math.round(wastedTokens / totalTokens * 100) : 0;
  const severity = overkillRate > 30 ? "high" : overkillRate > 15 ? "medium" : "low";
  const confidence = Math.min(0.9, 0.5 + overkillSessions.length * 0.03);
  const evidence = {
    overkillSessions: overkillSessions.length,
    totalSessions: sessions.length,
    overkillRate: Math.round(overkillRate),
    estimatedWastePercent: savingsPercent,
    examples
  };
  const remediation = buildModelSelectionRemediation(evidence);
  const byProject = /* @__PURE__ */ new Map();
  for (const ex of evidence.examples) {
    const list = byProject.get(ex.project) ?? [];
    list.push(ex);
    byProject.set(ex.project, list);
  }
  const sessionBreakdown = [...byProject.entries()].map(([project, examples2]) => {
    const rows = examples2.map(
      (ex) => `  - **${ex.project}** (${ex.date}): used **${ex.model.replace("claude-", "")}**, ${ex.toolCount} tool uses, complexity: ${ex.complexity} \u2192 **${ex.suggestedModel.replace("claude-", "")} was sufficient**`
    ).join("\n");
    return `**${project}**
${rows}`;
  }).join("\n\n");
  return {
    detector: "model-selection",
    title: "Model Selection",
    severity,
    savingsPercent,
    savingsTokens: wastedTokens,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
    remediation,
    sessionBreakdown: sessionBreakdown || "_No specific sessions to call out._"
  };
}
function buildModelSelectionRemediation(evidence) {
  const byProject = /* @__PURE__ */ new Map();
  for (const ex of evidence.examples) {
    const existing = byProject.get(ex.project);
    if (existing) {
      existing.count++;
      existing.examples.push(ex);
    } else {
      byProject.set(ex.project, { count: 1, examples: [ex] });
    }
  }
  const projectLines = [...byProject.entries()].sort((a, b) => b[1].count - a[1].count).map(([proj, d]) => {
    const ex = d.examples[0];
    return `**${proj}** (${d.count} session${d.count > 1 ? "s" : ""} \u2014 e.g., ${ex.toolCount} tool uses, ${ex.complexity} complexity)`;
  }).join("; ");
  const simpleExamples = evidence.examples.filter((e) => e.complexity === "simple");
  return {
    problem: `${evidence.overkillSessions} of your ${evidence.totalSessions} sessions (${evidence.overkillRate}%) used Opus when Sonnet would have been sufficient. By project: ${projectLines || `${evidence.overkillSessions} sessions`}. ${simpleExamples.length > 0 ? `${simpleExamples.length} of these were simple tasks (under 5 tool uses, all basic Read/Edit/Bash) where Opus adds no quality benefit over Sonnet.` : ""}`,
    whyItMatters: `Opus processes ~5x more tokens per task than Sonnet for identical work on simple tasks. For the sessions flagged above, the tasks didn't require deep reasoning: ${simpleExamples.length > 0 ? `things like "${simpleExamples[0].complexity}" work in **${simpleExamples[0].project}** with only ${simpleExamples[0].toolCount} tool uses` : "routine edits and exploration"}. Sonnet handles these identically. Your ${evidence.overkillRate}% overkill rate means ~1 in every ${Math.round(100 / Math.max(evidence.overkillRate, 1))} sessions wastes tokens by running on an unnecessarily powerful model. Since every token in every turn is processed, this is the highest-leverage single setting to change.`,
    steps: [
      {
        action: "Set Sonnet as your default model",
        howTo: "In your Claude settings file, set your default model to `claude-sonnet-4-6`. This applies globally so every new session starts on Sonnet. You can also set it per-project in CLAUDE.md. Sonnet handles the vast majority of coding tasks \u2014 file reads, edits, test runs, git operations, one-file bug fixes, documentation \u2014 identically to Opus.",
        impact: "Eliminates accidental Opus usage on simple tasks without any per-session effort. Switching to Sonnet for straightforward work reduces token processing by ~5x per session that doesn't genuinely need deep reasoning."
      },
      {
        action: "Switch to Opus mid-session only for reasoning-heavy tasks",
        howTo: "Switch to Opus when you hit a task that needs it: complex multi-file refactors, architectural decisions, intricate debugging across many files, or generating complex algorithms from scratch. Switch back to Sonnet when done. You can also toggle fast mode for quick model switching.",
        impact: "Keeps token usage minimal on straightforward work while giving you Opus quality exactly when it matters. Most sessions never need to switch."
      },
      {
        action: "Use Haiku for subagent tasks",
        howTo: "When configuring subagents (in `.claude/agents/` YAML files), set `model: haiku` for agents doing simple tasks: file searches, log parsing, running tests, formatting checks. Haiku is ~19x more token-efficient than Opus for work that doesn't require reasoning.",
        impact: "Subagent tasks are typically mechanical (grep, read, run). Running them on Haiku instead of Opus reduces subagent token consumption by 90%+."
      }
    ],
    examples: [
      {
        label: "Simple task \u2014 use Sonnet",
        before: '[Opus] "Read package.json and update the version to 2.1.0" \u2192 3 tool uses, same result as Sonnet but ~5x more tokens processed',
        after: "[Sonnet] Same task, identical quality \u2192 3 tool uses, ~80% fewer tokens processed"
      },
      {
        label: "Opus is justified",
        before: '[Sonnet] "Design the database schema for a multi-tenant SaaS with row-level security" \u2192 shallow analysis, misses edge cases',
        after: "[Opus] Same task \u2192 thorough analysis of isolation strategies, performance implications, migration path \u2014 complex architectural reasoning where Opus justifies the extra tokens"
      },
      {
        label: "Subagent with Haiku",
        before: "[Opus subagent] Runs grep across 200 files to find all usages of a deprecated function \u2192 mechanical search with heavy token processing",
        after: "[Haiku subagent] Same search \u2192 identical results at ~1/19th the token usage"
      }
    ],
    quickWin: "In your Claude settings file, set your default model to `claude-sonnet-4-6`. Then switch to Opus only when you're about to do something that genuinely requires architectural reasoning \u2014 not for routine edits or file reads.",
    specificQuickWin: (() => {
      const simple = evidence.examples.filter((e) => e.complexity === "simple").slice(0, 2);
      const medium = evidence.examples.filter((e) => e.complexity === "medium").slice(0, 2);
      const shown = [...simple, ...medium].slice(0, 3);
      if (shown.length === 0) return `Switch to Sonnet as your default. ${evidence.overkillRate}% of your sessions used Opus where Sonnet would have been sufficient.`;
      const lines = shown.map((e) => `**${e.project}** (${e.date}): ${e.toolCount} tool uses, all ${e.complexity} \u2014 Sonnet sufficient`);
      return `Switch to Sonnet as your default. Sessions that didn't need Opus:
${lines.map((l) => `  - ${l}`).join("\n")}
These had ${shown[0]?.toolCount ?? "few"} or fewer tool uses with no complex reasoning \u2014 the exact profile where Sonnet matches Opus quality while using ~80% fewer tokens.`;
    })(),
    effort: "quick"
  };
}

// src/detectors/file-read-waste.ts
var GENERATED_PATTERNS = [
  /\/node_modules\//,
  /\/dist\//,
  /\/build\//,
  /\/.git\//,
  /\/__pycache__\//,
  /\.pyc$/,
  /\.class$/
];
function isGeneratedFile(path) {
  return GENERATED_PATTERNS.some((p) => p.test(path));
}
function detectFileReadWaste(sessions) {
  if (sessions.length === 0) return null;
  let totalDuplicateReads = 0;
  let totalUnusedReads = 0;
  let totalGeneratedReads = 0;
  let totalWastedTokens = 0;
  let sessionsWithWaste = 0;
  const allDuplicates = [];
  for (const session of sessions) {
    const fileReads = /* @__PURE__ */ new Map();
    let sessionWaste = false;
    for (const toolUse of session.toolUses) {
      if (toolUse.name === "Read") {
        const filePath = toolUse.input.file_path;
        if (!filePath) continue;
        const existing = fileReads.get(filePath);
        if (existing) {
          existing.count++;
          existing.timestamps.push(toolUse.timestamp);
        } else {
          fileReads.set(filePath, {
            path: filePath,
            count: 1,
            tokens: 0,
            // We don't have exact token count per file
            timestamps: [toolUse.timestamp]
          });
        }
        if (isGeneratedFile(filePath)) {
          totalGeneratedReads++;
          sessionWaste = true;
        }
      }
    }
    for (const [path, info] of fileReads) {
      if (info.count > 1) {
        totalDuplicateReads += info.count - 1;
        sessionWaste = true;
        allDuplicates.push({
          slug: session.slug,
          project: session.project,
          file: path.split("/").pop() ?? path,
          count: info.count,
          tokens: Math.round(session.totalInputTokens / session.toolUses.length) * (info.count - 1),
          startedAt: session.startedAt,
          firstPrompt: session.messages.find((m) => m.role === "user")?.content?.slice(0, 300) ?? ""
        });
      }
    }
    const editedFiles = /* @__PURE__ */ new Set();
    for (const toolUse of session.toolUses) {
      if (toolUse.name === "Edit" || toolUse.name === "Write") {
        const filePath = toolUse.input.file_path;
        if (filePath) {
          editedFiles.add(filePath);
        }
      }
    }
    for (const [path, info] of fileReads) {
      if (info.count === 1 && !editedFiles.has(path) && !isGeneratedFile(path)) {
        if (editedFiles.size === 0) {
          totalUnusedReads++;
          sessionWaste = true;
        }
      }
    }
    if (sessionWaste) {
      sessionsWithWaste++;
    }
  }
  if (sessionsWithWaste === 0) return null;
  const avgInputTokensPerSession = sessions.reduce((sum, s) => sum + s.totalInputTokens, 0) / sessions.length;
  const avgReadsPerSession = sessions.reduce((sum, s) => sum + s.toolUses.filter((t) => t.name === "Read").length, 0) / sessions.length;
  if (avgReadsPerSession > 0) {
    const tokensPerRead = avgInputTokensPerSession / avgReadsPerSession;
    totalWastedTokens = Math.round(tokensPerRead * (totalDuplicateReads + totalUnusedReads + totalGeneratedReads));
  }
  const topDuplicates = allDuplicates.sort((a, b) => b.count - a.count).slice(0, 5);
  const wasteRate = sessionsWithWaste / sessions.length * 100;
  const totalTokens = sessions.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreationTokens,
    0
  );
  const savingsPercent = totalTokens > 0 ? Math.round(totalWastedTokens / totalTokens * 100) : 0;
  const severity = savingsPercent > 10 ? "high" : savingsPercent > 5 ? "medium" : "low";
  const confidence = Math.min(0.85, 0.4 + sessionsWithWaste * 0.02);
  const evidence = {
    sessionsWithWaste,
    totalSessions: sessions.length,
    wasteRate: Math.round(wasteRate),
    duplicateReads: totalDuplicateReads,
    unusedReads: totalUnusedReads,
    generatedFileReads: totalGeneratedReads,
    wastedTokens: totalWastedTokens,
    topDuplicates
  };
  const remediation = buildFileReadRemediation(evidence);
  const byProject = /* @__PURE__ */ new Map();
  for (const d of evidence.topDuplicates) {
    const list = byProject.get(d.project) ?? [];
    list.push(d);
    byProject.set(d.project, list);
  }
  const sessionBreakdown = [...byProject.entries()].map(([project, dupes]) => {
    const rows = dupes.map(
      (d) => `  - \`${d.file}\` read **${d.count}x** (~${Math.round(d.tokens / 1e3)}K tokens wasted)`
    ).join("\n");
    return `**${project}**
${rows}`;
  }).join("\n\n");
  return {
    detector: "file-read-waste",
    title: "File Read Waste",
    severity,
    savingsPercent,
    savingsTokens: totalWastedTokens,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
    remediation,
    sessionBreakdown: sessionBreakdown || "_No specific sessions to call out._"
  };
}
function buildFileReadRemediation(evidence) {
  const formattedTokens = evidence.wastedTokens > 1e6 ? `${(evidence.wastedTokens / 1e6).toFixed(1)}M` : `${Math.round(evidence.wastedTokens / 1e3)}K`;
  const byProject = /* @__PURE__ */ new Map();
  for (const d of evidence.topDuplicates) {
    const existing = byProject.get(d.project);
    if (existing) {
      existing.files.push(`\`${d.file}\` (${d.count}\xD7)`);
      existing.totalReads += d.count - 1;
    } else {
      byProject.set(d.project, { files: [`\`${d.file}\` (${d.count}\xD7)`], totalReads: d.count - 1, worstSlug: d.slug });
    }
  }
  const projectLines = [...byProject.entries()].map(([proj, d]) => `**${proj}**: ${d.files.slice(0, 2).join(", ")}`).join("; ");
  const worst = evidence.topDuplicates[0];
  return {
    problem: `Claude re-read the same files ${evidence.duplicateReads} times across ${evidence.sessionsWithWaste} sessions (${evidence.wasteRate}% of total) \u2014 without those files being modified in between. ${projectLines ? `By project: ${projectLines}. ` : ""}${evidence.generatedFileReads > 0 ? `Additionally, ${evidence.generatedFileReads} reads hit generated files (node_modules/, dist/, build/). ` : ""}In AI conversations, every Read operation sends the entire file contents into the context window \u2014 re-reading a file means injecting the same tokens again for content that is already available from a prior turn.`,
    whyItMatters: `${worst ? `Your single worst case: \`${worst.file}\` read ${worst.count} times in **${worst.project}** \u2014 that's ${worst.count - 1} unnecessary reads of the same content. ` : ""}Re-reading a file in an AI conversation is wasteful because the entire file content is injected into the context window each time. Each duplicate read adds ~500\u20135,000 tokens depending on file size, for zero new information. Total estimated waste: ~${formattedTokens} tokens. In projects like **${worst?.project ?? "your projects"}**, where the same config or core files get revisited repeatedly across a session, this compounds quickly \u2014 each redundant read also raises the context floor for all subsequent turns, making every future response consume more tokens.`,
    steps: [
      {
        action: "Reference files by name instead of re-reading them",
        howTo: `After Claude reads a file, refer to it by name in follow-up prompts (e.g., "In the auth.ts file you just read, change the validateToken function"). Claude retains file contents in context and doesn't need to re-read unless the file was modified.`,
        impact: "Eliminates the most common source of duplicate reads. Based on your data, this could prevent ~" + Math.round(evidence.duplicateReads * 0.7) + " redundant reads."
      },
      {
        action: "Batch related file reads in a single prompt",
        howTo: 'Instead of asking Claude to "look at the auth module" (which triggers sequential reads), specify all files upfront: "Read src/auth/login.ts, src/auth/jwt.ts, and src/auth/middleware.ts, then explain the auth flow." Claude will read them in parallel and build understanding in one pass.',
        impact: "Reduces exploration loops where Claude reads files one-by-one, forgets earlier ones, and re-reads them."
      },
      {
        action: "Use targeted reads with line ranges for large files",
        howTo: 'For large files, ask Claude to read specific sections: "Read lines 50-120 of database.ts" instead of the entire file. This is especially important for config files, test files, and generated code.',
        impact: "Reduces per-read token usage by 60-90% for large files, and the smaller payload stays in context more effectively."
      },
      ...evidence.generatedFileReads > 0 ? [{
        action: "Avoid reading generated/vendored files",
        howTo: "Don't ask Claude to read files in node_modules/, dist/, or build/ directories. Instead, reference documentation or type definitions. If you need to understand a dependency, ask Claude to check the package's types or README.",
        impact: `Eliminates ${evidence.generatedFileReads} reads of generated files that rarely provide useful context.`
      }] : [],
      {
        action: "Create project documentation files to replace exploration reads",
        howTo: "Write a project documentation file (e.g., ARCHITECTURE.md or a similar overview) that describes your project's structure, key directories, naming conventions, and core modules. When you start a new session, point Claude to this file once instead of letting it explore the codebase by reading files one by one. The files that appear most in your duplicate reads are the ones Claude keeps re-reading to re-orient itself \u2014 document those upfront.",
        impact: `A concise project overview replaces the re-orientation reads that drive duplicate counts. Your worst offenders (${worst ? `\`${worst.file}\` in **${worst.project}**` : "your most-read files"}) are prime candidates for being summarized once in documentation rather than re-read on every session.`
      }
    ],
    examples: [
      {
        label: "Avoiding duplicate reads",
        before: 'Turn 1: "Read src/auth.ts" \u2192 Turn 4: "Read src/auth.ts again to check the function" \u2192 Turn 7: "Can you re-read src/auth.ts?"',
        after: 'Turn 1: "Read src/auth.ts" \u2192 Turn 4: "In the auth.ts you already read, what does validateToken do?" \u2192 Turn 7: "Now modify the validateToken function in auth.ts"'
      },
      {
        label: "Batched exploration",
        before: '"Look at the auth module" \u2192 Claude reads file 1 \u2192 reads file 2 \u2192 reads file 3 \u2192 re-reads file 1 to cross-reference',
        after: '"Read src/auth/login.ts, src/auth/jwt.ts, and src/auth/middleware.ts. Explain how login calls jwt validation and how middleware enforces it."'
      }
    ],
    quickWin: 'In your next session, when you need to reference a file Claude already read, say "in the X file you read earlier" instead of asking it to read again. This prevents the most common duplicate reads.',
    specificQuickWin: (() => {
      const top = evidence.topDuplicates.slice(0, 3);
      if (top.length === 0) return 'When referencing a file Claude already read, say "in the [filename] you read earlier" \u2014 no re-read needed.';
      const parts = top.map((d) => `\`${d.file}\` (${d.count}x in **${d.project}**)`);
      return `Your most-duplicated files: ${parts.join("; ")}. When Claude has already read a file, reference it by name instead of triggering a re-read: say "in the \`${top[0].file}\` you already read, look at..." \u2014 not "read \`${top[0].file}\` again".`;
    })(),
    effort: "quick"
  };
}

// src/detectors/bash-output-bloat.ts
var BLOAT_PATTERNS = {
  excessiveFlags: [
    { pattern: /ls\s+-R|--recursive/, reason: "Recursive listing" },
    { pattern: /find\s+.*(?!\|)/, reason: "Find without limits" },
    { pattern: /git\s+log(?!\s+-(n|\d))/, reason: "Git log without limit" },
    { pattern: /--verbose|-v{2,}/, reason: "Verbose output" }
  ],
  missingPagination: [
    { pattern: /^(cat|head|tail)\s+\S+\.(log|txt|json|xml|csv)$/m, reason: "Reading large file directly" },
    { pattern: /npm\s+(list|ls)(?!\s+--depth)/, reason: "NPM list without depth" },
    { pattern: /pip\s+list/, reason: "Pip list without format" }
  ],
  fullFileDumps: [
    { pattern: /^cat\s+\S+\.(md|txt|log)$/m, reason: "Cat on text file" },
    { pattern: /echo\s+["'].*["']\s*>/, reason: "Echo to file (use Write tool)" }
  ],
  usageChecks: [
    { pattern: /--help$/, reason: "Help command" },
    { pattern: /--version$/, reason: "Version check" },
    { pattern: /-h$/, reason: "Help flag" }
  ]
};
function detectBloatPatterns(command) {
  const matches = [];
  for (const [category, patterns] of Object.entries(BLOAT_PATTERNS)) {
    for (const { pattern, reason } of patterns) {
      if (pattern.test(command)) {
        matches.push({ command, category, reason });
      }
    }
  }
  return matches;
}
function detectBashOutputBloat(sessions) {
  if (sessions.length === 0) return null;
  const categoryCounts = {
    excessiveFlags: 0,
    missingPagination: 0,
    fullFileDumps: 0,
    usageChecks: 0
  };
  const allExamples = [];
  let sessionsWithBloat = 0;
  for (const session of sessions) {
    let sessionBloat = false;
    for (const toolUse of session.toolUses) {
      if (toolUse.name !== "Bash") continue;
      const command = toolUse.input.command ?? toolUse.input.cmd;
      if (!command) continue;
      const matches = detectBloatPatterns(command);
      if (matches.length > 0) {
        sessionBloat = true;
        for (const match of matches) {
          categoryCounts[match.category]++;
          if (allExamples.length < 10) {
            allExamples.push({
              slug: session.slug,
              project: session.project,
              command: command.slice(0, 100),
              category: match.category,
              startedAt: session.startedAt,
              firstPrompt: session.messages.find((m) => m.role === "user")?.content?.slice(0, 300) ?? ""
            });
          }
        }
      }
    }
    if (sessionBloat) {
      sessionsWithBloat++;
    }
  }
  const totalBloats = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  if (totalBloats === 0) return null;
  const bloatRate = sessionsWithBloat / sessions.length * 100;
  const avgWastePerBloat = 1e3;
  const wastedTokens = totalBloats * avgWastePerBloat;
  const totalTokens = sessions.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreationTokens,
    0
  );
  const savingsPercent = totalTokens > 0 ? Math.round(wastedTokens / totalTokens * 100) : 0;
  const severity = savingsPercent > 5 ? "high" : savingsPercent > 2 ? "medium" : "low";
  const confidence = Math.min(0.8, 0.4 + sessionsWithBloat * 0.015);
  const evidence = {
    sessionsWithBloat,
    totalSessions: sessions.length,
    bloatRate: Math.round(bloatRate),
    categories: categoryCounts,
    examples: allExamples.slice(0, 5)
  };
  const remediation = buildBashBloatRemediation(evidence, categoryCounts);
  const byProject = /* @__PURE__ */ new Map();
  for (const ex of allExamples.slice(0, 10)) {
    const list = byProject.get(ex.project) ?? [];
    list.push(ex);
    byProject.set(ex.project, list);
  }
  const sessionBreakdown = [...byProject.entries()].map(([project, exs]) => {
    const rows = exs.map(
      (ex) => `  - \`${ex.command.slice(0, 80)}${ex.command.length > 80 ? "\u2026" : ""}\` (${ex.category})`
    ).join("\n");
    return `**${project}**
${rows}`;
  }).join("\n\n");
  return {
    detector: "bash-output-bloat",
    title: "Bash Output Bloat",
    severity,
    savingsPercent,
    savingsTokens: wastedTokens,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
    remediation,
    sessionBreakdown: sessionBreakdown || "_No specific sessions to call out._"
  };
}
function buildBashBloatRemediation(evidence, categories) {
  const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  const topCategoryName = topCategory ? topCategory[0].replace(/([A-Z])/g, " $1").toLowerCase().trim() : "unknown";
  const topCategoryCount = topCategory ? topCategory[1] : 0;
  return {
    problem: `${evidence.sessionsWithBloat} sessions (${evidence.bloatRate}% of total) contained bash commands that produced unnecessarily large output. The most common category was "${topCategoryName}" with ${topCategoryCount} occurrences. When a bash command dumps thousands of lines into the conversation, Claude has to process all of it \u2014 even if only a few lines are relevant. This bloats the context and slows down responses.`,
    whyItMatters: `Bash output goes directly into the context window as a tool result \u2014 and it stays there permanently for the entire session. Every line a command prints becomes part of the conversation that Claude must process on every subsequent turn. A single \`git log\` without \`-n\` can dump thousands of commits (10,000+ tokens) that cannot be removed. A \`find\` without limits can return thousands of files. Unlike file reads (which are somewhat bounded), bash output has no guardrails \u2014 one bad command can inject more tokens than 20 file reads combined, and those tokens persist until the session ends. ${categories.fullFileDumps > 0 ? `You had ${categories.fullFileDumps} instances of using \`cat\` on files instead of the Read tool, which doesn't support targeted line ranges.` : ""}`,
    steps: [
      ...categories.excessiveFlags > 0 ? [{
        action: "Always limit output-heavy commands",
        howTo: 'Add limits to commands: `git log -n 20` instead of `git log`, `find . -name "*.ts" | head -20` instead of unbounded find, `ls` instead of `ls -R`. Ask Claude to "show me the last 10 commits" rather than "show me the git log."',
        impact: `Prevents ${categories.excessiveFlags} instances of excessive output. A bounded \`git log -n 10\` is ~500 tokens vs unbounded at 10,000+.`
      }] : [],
      ...categories.missingPagination > 0 ? [{
        action: "Pipe large outputs through head/tail/grep",
        howTo: 'When running commands that might produce large output, pipe through filters: `npm list --depth=0` instead of `npm list`, `docker ps --format "table {{.Names}}\\t{{.Status}}"` instead of `docker ps -a`. Tell Claude to "show me only the relevant lines."',
        impact: `Prevents ${categories.missingPagination} instances of unpaginated output from bloating context.`
      }] : [],
      ...categories.fullFileDumps > 0 ? [{
        action: "Use the Read tool instead of cat/head/tail",
        howTo: 'Claude has a built-in Read tool that supports line ranges and is designed for file reading. Instead of `cat file.ts`, Claude should use `Read file.ts`. You can help by saying "read the file" instead of "cat the file" in your prompts.',
        impact: `The Read tool is more token-efficient and supports targeted ranges. Eliminates ${categories.fullFileDumps} cat/echo commands.`
      }] : [],
      {
        action: "Be specific about what output you need",
        howTo: 'Instead of "run the tests," say "run the tests and show me only failures." Instead of "check npm dependencies," say "show me outdated dependencies with `npm outdated`." The more specific your request, the more Claude can filter the output.',
        impact: "Reduces average bash output size by 50-80% by focusing on relevant information."
      },
      {
        action: "Filter command output before it enters the conversation",
        howTo: "Any output from a bash command is permanently added to the context window for the rest of the session \u2014 it cannot be removed or summarized later. Structure your commands so only the relevant lines are produced in the first place. For example, instead of dumping a 50K-line log file and hoping to find errors, use `grep ERROR server.log | tail -20` so only the 20 most recent error lines ever enter the context. The key principle: whatever the command outputs, Claude has to carry for the entire session.",
        impact: "Filtering at the command level (grep, awk, sed, head, tail) prevents thousands of irrelevant tokens from entering the context window permanently. A single `grep` on a large file can reduce a 10,000-token result to under 200 tokens."
      }
    ],
    examples: [
      {
        label: "Git log",
        before: "`git log` \u2192 500+ commits dumped into context (15,000+ tokens)",
        after: "`git log -n 10 --oneline` \u2192 10 lines (200 tokens)"
      },
      {
        label: "File reading",
        before: "`cat src/big-module.ts` \u2192 entire 500-line file as bash output (3,000 tokens)",
        after: "Read tool with line range \u2192 only relevant section (500 tokens)"
      },
      {
        label: "Dependency listing",
        before: "`npm list` \u2192 full dependency tree with 200+ packages (5,000 tokens)",
        after: "`npm list --depth=0` \u2192 only top-level packages (500 tokens)"
      }
    ],
    quickWin: 'When asking Claude to run a command, add "show me only the first 20 lines" or "only show errors" to your prompt. This teaches Claude to pipe through `head` or `grep` automatically.',
    specificQuickWin: (() => {
      const top = evidence.examples.slice(0, 3);
      if (top.length === 0) return "Add output limits to commands (e.g., `git log -n 10`, `find . | head -20`).";
      const lines = top.map((e) => `\`${e.command.slice(0, 60)}\` in **${e.project}**`);
      return `Bloaty commands found:
${lines.map((l) => `  - ${l}`).join("\n")}
Add limits: \`git log\` \u2192 \`git log -n 10 --oneline\`, unbounded \`find\` \u2192 \`find . -name "*.ts" | head -20\`.`;
    })(),
    effort: "quick"
  };
}

// src/detectors/vague-prompts.ts
var VAGUE_VERBS = [
  "fix",
  "improve",
  "optimize",
  "refactor",
  "clean",
  "update",
  "change",
  "modify",
  "enhance",
  "better",
  "best",
  "good"
];
var SPECIFICITY_PATTERNS = [
  /\.(ts|js|py|java|go|rs|tsx|jsx)$/,
  // File extensions
  /[A-Z][a-z]+[A-Z]/,
  // CamelCase (function/class names)
  /`[^`]+`/,
  // Code in backticks
  /['"][^'"]+['"]/,
  // Quoted strings
  /\b(class|function|method|variable|interface|type)\s+\w+/
  // Named entities
];
function isVaguePrompt(content) {
  const words = content.trim().split(/\s+/);
  const wordCount = words.length;
  if (wordCount < 5) {
    return { isVague: true, reason: "Very short prompt (<5 words)" };
  }
  if (wordCount < 10) {
    const hasSpecificity = SPECIFICITY_PATTERNS.some((p) => p.test(content));
    if (!hasSpecificity) {
      return { isVague: true, reason: "Short prompt without specifics" };
    }
  }
  const lowerContent = content.toLowerCase();
  const usedVagueVerbs = VAGUE_VERBS.filter((v) => lowerContent.includes(v));
  if (usedVagueVerbs.length > 0 && wordCount < 20) {
    const hasSpecificity = SPECIFICITY_PATTERNS.some((p) => p.test(content));
    if (!hasSpecificity) {
      return { isVague: true, reason: `Vague verb(s): ${usedVagueVerbs.join(", ")}` };
    }
  }
  return { isVague: false, reason: "" };
}
function estimateClarificationRounds(session) {
  let rounds = 0;
  const userMessages = session.messages.filter((m) => m.role === "user");
  for (let i = 1; i < userMessages.length; i++) {
    const msg = userMessages[i];
    if (!msg) continue;
    const wordCount = msg.content.split(/\s+/).length;
    if (wordCount < 15) {
      rounds++;
    }
  }
  return rounds;
}
function detectVaguePrompts(sessions) {
  if (sessions.length === 0) return null;
  const vagueSessions = [];
  const positiveExamples = [];
  const vagueVerbs = {};
  let totalPromptLength = 0;
  let totalClarificationRounds = 0;
  for (const session of sessions) {
    const userMessages = session.messages.filter((m) => m.role === "user");
    if (userMessages.length === 0) continue;
    const firstPrompt = userMessages[0]?.content ?? "";
    const wordCount = firstPrompt.split(/\s+/).length;
    totalPromptLength += wordCount;
    const { isVague, reason } = isVaguePrompt(firstPrompt);
    if (isVague) {
      vagueSessions.push({
        session,
        prompt: firstPrompt.slice(0, 200),
        wordCount,
        reason
      });
      const lowerPrompt = firstPrompt.toLowerCase();
      for (const verb of VAGUE_VERBS) {
        if (lowerPrompt.includes(verb)) {
          vagueVerbs[verb] = (vagueVerbs[verb] ?? 0) + 1;
        }
      }
      totalClarificationRounds += estimateClarificationRounds(session);
    } else if (positiveExamples.length < 5 && wordCount > 10) {
      positiveExamples.push({
        slug: session.slug,
        project: session.project,
        prompt: firstPrompt.slice(0, 100),
        wordCount
      });
    }
  }
  if (vagueSessions.length === 0) return null;
  const vagueRate = vagueSessions.length / sessions.length * 100;
  const avgPromptLength = Math.round(totalPromptLength / sessions.length);
  const examples = vagueSessions.slice(0, 5).map((v) => ({
    slug: v.session.slug,
    project: v.session.project,
    prompt: v.prompt,
    wordCount: v.wordCount,
    vagueReason: v.reason
  }));
  const vagueTokens = vagueSessions.reduce(
    (sum, v) => sum + v.session.totalInputTokens + v.session.totalOutputTokens,
    0
  );
  const nonVagueSessions = sessions.filter(
    (s) => !vagueSessions.some((v) => v.session.id === s.id)
  );
  let wastedTokens;
  if (nonVagueSessions.length > 0) {
    const avgVague = vagueTokens / vagueSessions.length;
    const avgNonVague = nonVagueSessions.reduce(
      (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens,
      0
    ) / nonVagueSessions.length;
    const overheadPerSession = Math.max(0, avgVague - avgNonVague) * 0.3;
    wastedTokens = Math.round(overheadPerSession * vagueSessions.length);
  } else {
    const avgClarificationsPerVague = totalClarificationRounds / vagueSessions.length;
    wastedTokens = Math.round(vagueSessions.length * avgClarificationsPerVague * 750);
  }
  const totalTokens = sessions.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreationTokens,
    0
  );
  const savingsPercent = totalTokens > 0 ? Math.round(wastedTokens / totalTokens * 100) : 0;
  const severity = vagueRate > 40 ? "high" : vagueRate > 20 ? "medium" : "low";
  const confidence = Math.min(0.85, 0.5 + vagueSessions.length * 0.02);
  const evidence = {
    sessionsWithVaguePrompts: vagueSessions.length,
    totalSessions: sessions.length,
    vagueRate: Math.round(vagueRate),
    clarificationRounds: totalClarificationRounds,
    avgPromptLength,
    vagueVerbs,
    examples,
    positiveExamples: positiveExamples.slice(0, 3)
  };
  const remediation = buildVaguePromptsRemediation(evidence);
  const sessionBreakdown = vagueSessions.slice(0, 6).reduce((acc, v) => {
    const proj = v.session.project;
    if (!acc[proj]) acc[proj] = [];
    acc[proj].push(`  - "${v.prompt.slice(0, 70)}${v.prompt.length > 70 ? "\u2026" : ""}" (${v.reason})`);
    return acc;
  }, {});
  const sessionBreakdownStr = Object.entries(sessionBreakdown).map(([project, rows]) => `**${project}**
${rows.join("\n")}`).join("\n\n");
  return {
    detector: "vague-prompts",
    title: "Vague Prompts",
    severity,
    savingsPercent,
    savingsTokens: wastedTokens,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
    remediation,
    sessionBreakdown: sessionBreakdownStr || "_No specific sessions to call out._"
  };
}
function buildVaguePromptsRemediation(evidence) {
  const topVerbs = Object.entries(evidence.vagueVerbs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([verb]) => verb);
  const vagueExample = evidence.examples[0];
  const goodExample = evidence.positiveExamples[0];
  const byProject = /* @__PURE__ */ new Map();
  for (const ex of evidence.examples) {
    const existing = byProject.get(ex.project) ?? [];
    existing.push(`"${ex.prompt.slice(0, 50)}${ex.prompt.length > 50 ? "\u2026" : ""}"`);
    byProject.set(ex.project, existing);
  }
  const projectLines = [...byProject.entries()].map(([proj, prompts]) => `**${proj}**: ${prompts.slice(0, 2).join(", ")}`).join("; ");
  const avgClarifications = Math.round(evidence.clarificationRounds / Math.max(evidence.sessionsWithVaguePrompts, 1));
  return {
    problem: `${evidence.sessionsWithVaguePrompts} sessions (${evidence.vagueRate}% of total) started with prompts too vague for Claude to act on without exploration or clarification. ${topVerbs.length > 0 ? `Most frequent vague verbs: "${topVerbs.join('", "')}". ` : ""}By project: ${projectLines || "multiple projects"}. Each vague prompt forces Claude to ask questions or explore speculatively \u2014 adding turns and context before any real work begins.`,
    whyItMatters: `${vagueExample ? `Example from **${vagueExample.project}**: "${vagueExample.prompt.slice(0, 80)}${vagueExample.prompt.length > 80 ? "\u2026" : ""}" \u2014 flagged because: ${vagueExample.vagueReason}. ` : ""}Vague prompts trigger a discovery loop: Claude guesses \u2192 reads files to check \u2192 asks for clarification \u2192 you answer \u2192 Claude re-reads. Your vague sessions averaged ${avgClarifications} clarification round${avgClarifications !== 1 ? "s" : ""} each. Worse, files Claude read while guessing stay in context permanently, even when they turned out irrelevant. ${goodExample ? `Contrast with this effective prompt from **${goodExample.project}**: "${goodExample.prompt.slice(0, 100)}" \u2014 ${goodExample.wordCount} words, no exploration needed.` : ""}`,
    steps: [
      {
        action: "Include file paths and function names in your prompt",
        howTo: 'Instead of "fix the login bug," write "Fix the JWT validation bug in src/auth/jwt.ts \u2014 the validateToken() function throws on expired tokens instead of returning false." The more identifiers you include, the fewer exploration turns Claude needs.',
        impact: "Eliminates 1-3 exploration turns per session. Each saved turn prevents ~2,000-5,000 tokens of context bloat."
      },
      {
        action: "Specify the desired outcome, not just the action",
        howTo: 'Instead of "improve the error handling," write "Add try-catch to the database calls in src/db/queries.ts so that connection failures return a 503 status instead of crashing the server." Define what "done" looks like.',
        impact: 'Removes ambiguity about scope. Claude can implement in one pass instead of iterating on what "improve" means.'
      },
      {
        action: "Provide constraints and context upfront",
        howTo: `Add relevant constraints: "Don't modify the public API," "Keep backward compatibility with v2 clients," "The tests in auth.test.ts should still pass." This prevents Claude from making assumptions that require correction later.`,
        impact: "Reduces back-and-forth corrections. Each correction round costs ~1,000 tokens and often triggers re-reads of files."
      }
    ],
    examples: [
      {
        label: "Bug fix prompt",
        before: '"Fix the login bug"',
        after: `"Fix the login bug in src/auth/login.ts \u2014 users with special characters in passwords get a 400 error because the password isn't URL-encoded before the API call on line 47"`
      },
      {
        label: "Feature request prompt",
        before: '"Add caching"',
        after: '"Add Redis caching to the getUser() function in src/services/user.ts with a 5-minute TTL. Use the existing Redis client from src/lib/redis.ts. Cache key format: user:{id}"'
      },
      ...goodExample ? [{
        label: "One of your effective prompts",
        before: vagueExample?.prompt.slice(0, 100) ?? '"fix it"',
        after: goodExample.prompt.slice(0, 150)
      }] : []
    ],
    quickWin: "Before your next prompt, add one specific file path and one function/component name. Just these two additions cut exploration time significantly.",
    specificQuickWin: (() => {
      const top = evidence.examples.slice(0, 2);
      if (top.length === 0) return "Add a specific file path and function name to your next prompt.";
      const lines = top.map((e) => `**${e.project}**: "${e.prompt.slice(0, 60)}${e.prompt.length > 60 ? "..." : ""}" \u2014 ${e.vagueReason}`);
      return `Vague prompts detected:
${lines.map((l) => `  - ${l}`).join("\n")}
Fix: add a file path and function name. E.g., "${top[0].prompt.slice(0, 40)}..." \u2192 "[same intent] in \`src/[module]/[file].ts\`, specifically the \`[functionName]\` function".`;
    })(),
    effort: "quick"
  };
}

// src/detectors/session-timing.ts
function detectSessionTiming(sessions) {
  if (sessions.length === 0) return null;
  const hourlyData = /* @__PURE__ */ new Map();
  for (let i = 0; i < 24; i++) {
    hourlyData.set(i, { hour: i, sessions: 0, tokens: 0 });
  }
  let lateNightSessions = 0;
  let totalSessionLength = 0;
  for (const session of sessions) {
    const startTime = new Date(session.startedAt);
    const hour = startTime.getUTCHours();
    const window = hourlyData.get(hour);
    if (window) {
      window.sessions++;
      window.tokens += session.totalInputTokens + session.totalOutputTokens;
    }
    if (hour >= 22 || hour < 6) {
      lateNightSessions++;
    }
    if (session.endedAt && session.startedAt) {
      const length = new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
      totalSessionLength += length;
    }
  }
  const sortedHours = [...hourlyData.values()].sort((a, b) => b.tokens - a.tokens);
  const peakHours = sortedHours.slice(0, 3).map((h) => h.hour);
  const highIntensityWindows = [...hourlyData.values()].filter(
    (w) => w.sessions > sessions.length * 0.2
  ).length;
  const avgSessionLength = Math.round(totalSessionLength / sessions.length / 6e4);
  const recommendations = [];
  if (lateNightSessions > sessions.length * 0.2) {
    recommendations.push("Consider scheduling complex tasks during daytime for better focus");
  }
  if (highIntensityWindows > 3) {
    recommendations.push("High usage clustering detected - spread out sessions to avoid rate limits");
  }
  const peakHourStr = peakHours.map((h) => `${h}:00`).join(", ");
  recommendations.push(`Peak usage hours: ${peakHourStr} UTC`);
  const totalTokens = sessions.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreationTokens,
    0
  );
  const savingsPercent = highIntensityWindows > 3 ? 5 : lateNightSessions > sessions.length * 0.3 ? 3 : 0;
  if (savingsPercent === 0) return null;
  const severity = savingsPercent >= 5 ? "medium" : "low";
  const confidence = 0.6;
  const evidence = {
    totalSessions: sessions.length,
    peakHours,
    lateNightSessions,
    highIntensityWindows,
    avgSessionLength,
    recommendations
  };
  const remediation = buildSessionTimingRemediation(evidence, sessions.length);
  const peakStr = evidence.peakHours.map((h) => `${h}:00 UTC`).join(", ");
  const sessionBreakdown = `**Timing summary across all projects**
  - Peak hours: ${peakStr}
  - Late-night sessions (10PM\u20136AM): **${lateNightSessions}** of ${sessions.length}
  - High-intensity windows: **${evidence.highIntensityWindows}** hours with >20% of sessions
  - Average session length: **${evidence.avgSessionLength} min**`;
  return {
    detector: "session-timing",
    title: "Session Timing",
    severity,
    savingsPercent,
    savingsTokens: Math.round(totalTokens * (savingsPercent / 100)),
    confidence,
    evidence,
    remediation,
    sessionBreakdown
  };
}
function buildSessionTimingRemediation(evidence, totalSessions) {
  const peakHourStr = evidence.peakHours.map((h) => `${h}:00`).join(", ");
  const lateNightRate = Math.round(evidence.lateNightSessions / totalSessions * 100);
  return {
    problem: `Your session timing patterns show potential inefficiencies. ${evidence.lateNightSessions > 0 ? `${evidence.lateNightSessions} sessions (${lateNightRate}%) were started between 10 PM and 6 AM, when cognitive load and error rates are higher. ` : ""}${evidence.highIntensityWindows > 3 ? `You have ${evidence.highIntensityWindows} hours with concentrated usage, which increases your risk of hitting API rate limits. ` : ""}Peak usage hours: ${peakHourStr} UTC. Average session length: ${evidence.avgSessionLength} minutes.`,
    whyItMatters: `Timing affects both token efficiency and output quality. Late-night sessions tend to produce vaguer prompts and more back-and-forth corrections \u2014 each adding tokens to context. Concentrated usage windows increase rate-limit risk, which forces wait times and context reloads that waste tokens. There is a compounding relationship between session length and token usage: every turn in a session sends the full conversation history as input. A session that runs 40 turns may spend more tokens re-sending old context than on new work. When context grows past ~100K tokens, each additional turn uses significantly more input tokens, and the model's attention degrades \u2014 leading to more corrections and even more turns. This feedback loop is why a 60-minute session often uses 3-4x more tokens per useful output than a 20-minute session. ${evidence.avgSessionLength > 60 ? `Your average session length of ${evidence.avgSessionLength} minutes is well into the zone where context growth dominates token usage \u2014 splitting these into shorter, focused sessions would reduce token waste dramatically.` : ""}`,
    steps: [
      ...evidence.lateNightSessions > totalSessions * 0.2 ? [{
        action: "Schedule complex tasks during peak focus hours",
        howTo: "Save complex refactors, architectural decisions, and multi-file changes for your most alert hours. Use late-night sessions only for simple, well-defined tasks like quick fixes or documentation updates. If you must work late, write detailed prompts to compensate for reduced cognitive precision.",
        impact: "Better prompts during alert hours reduce clarification rounds and wasted exploration turns."
      }] : [],
      ...evidence.highIntensityWindows > 3 ? [{
        action: "Spread sessions across hours to avoid rate limits",
        howTo: "If you have batch work, stagger it across time windows instead of running many sessions in the same hour. When a session feels heavy with accumulated context, compact your context window (type /compact) to strip away stale history and keep per-turn token usage lean \u2014 this is especially effective during high-intensity windows to stay under rate limits.",
        impact: "Reduces rate-limit wait times. Rate limit pauses can force context reloads that waste 5,000-20,000 tokens per incident."
      }] : [],
      {
        action: "Keep sessions under 30 minutes when possible",
        howTo: `Set a mental timer. When a session runs long, ask yourself: "Am I still on the original task, or has this drifted?" If it's drifted, start a fresh session. Long sessions accumulate context debt that makes every turn consume more tokens.`,
        impact: `${evidence.avgSessionLength > 30 ? `Reducing your average session from ${evidence.avgSessionLength} to ~25 minutes would prevent most context snowball issues.` : "Keeps sessions focused and context lean."}`
      }
    ],
    examples: [
      {
        label: "Session timing",
        before: '11 PM: "refactor the auth module" \u2192 vague prompt \u2192 15 clarification turns \u2192 context snowball \u2192 frustrated at 1 AM',
        after: '10 AM: "Refactor src/auth/jwt.ts to separate token generation from validation. Keep the public API unchanged." \u2192 clean implementation in 5 turns'
      },
      {
        label: "Rate limit avoidance",
        before: "5 sessions started in the same hour \u2192 rate limited on session 4 \u2192 context lost \u2192 re-read 20 files \u2192 50K wasted tokens",
        after: "2 sessions per hour \u2192 no rate limits \u2192 smooth workflow \u2192 tokens spent on actual work"
      }
    ],
    quickWin: evidence.lateNightSessions > totalSessions * 0.2 ? "For your next late-night session, spend 30 extra seconds writing a detailed first prompt with specific file paths. This one habit compensates for reduced focus." : "Start your next intensive work block 15 minutes earlier to give yourself buffer time before rate limits could kick in.",
    specificQuickWin: (() => {
      const lateRate = Math.round(evidence.lateNightSessions / totalSessions * 100);
      const peakStr = evidence.peakHours.map((h) => `${h}:00`).join(", ");
      if (evidence.lateNightSessions > totalSessions * 0.2) {
        return `${evidence.lateNightSessions} of your ${totalSessions} sessions (${lateRate}%) ran between 10 PM\u20136 AM. Peak hours: ${peakStr} UTC. For late-night sessions, front-load context in your first prompt \u2014 specific file paths and function names compensate for reduced precision.`;
      }
      return `Peak usage at ${peakStr} UTC with ${evidence.highIntensityWindows} high-intensity hour(s). Spread sessions across hours to avoid rate-limit pauses, which force context reloads.`;
    })(),
    effort: "quick"
  };
}

// src/detectors/subagent-opportunity.ts
function findReadChains(session) {
  const readTools = ["Read", "Glob", "Grep"];
  let chainLength = 0;
  let maxChain = 0;
  let totalFiles = 0;
  for (const tool of session.toolUses) {
    if (readTools.includes(tool.name)) {
      chainLength++;
      totalFiles++;
      maxChain = Math.max(maxChain, chainLength);
    } else if (chainLength > 0) {
      chainLength = 0;
    }
  }
  if (maxChain >= 5) {
    return { chainLength: maxChain, filesExplored: totalFiles };
  }
  return null;
}
function detectSubagentOpportunity(sessions) {
  if (sessions.length === 0) return null;
  const opportunities = [];
  for (const session of sessions) {
    const result = findReadChains(session);
    if (result) {
      opportunities.push({
        session,
        chainLength: result.chainLength,
        filesExplored: result.filesExplored
      });
    }
  }
  if (opportunities.length === 0) return null;
  const opportunityRate = opportunities.length / sessions.length * 100;
  const avgChainLength = opportunities.reduce((sum, o) => sum + o.chainLength, 0) / opportunities.length;
  const examples = opportunities.sort((a, b) => b.chainLength - a.chainLength).slice(0, 5).map((o) => ({
    slug: o.session.slug,
    project: o.session.project,
    chainLength: o.chainLength,
    filesExplored: o.filesExplored,
    date: o.session.startedAt.split("T")[0] ?? "",
    startedAt: o.session.startedAt,
    firstPrompt: o.session.messages.find((m) => m.role === "user")?.content?.slice(0, 300) ?? ""
  }));
  const totalTokens = sessions.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreationTokens,
    0
  );
  const estimatedSavings = opportunities.reduce(
    (sum, o) => sum + o.filesExplored * 2e3,
    0
  );
  const savingsPercent = totalTokens > 0 ? Math.round(estimatedSavings / totalTokens * 100) : 0;
  const severity = opportunityRate > 40 ? "high" : opportunityRate > 20 ? "medium" : "low";
  const confidence = Math.min(0.85, 0.5 + opportunities.length * 0.03);
  const evidence = {
    sessionsWithOpportunity: opportunities.length,
    totalSessions: sessions.length,
    opportunityRate: Math.round(opportunityRate),
    avgChainLength: Math.round(avgChainLength * 10) / 10,
    examples
  };
  const remediation = buildSubagentRemediation(evidence, estimatedSavings);
  const byProject = /* @__PURE__ */ new Map();
  for (const ex of evidence.examples) {
    const list = byProject.get(ex.project) ?? [];
    list.push(ex);
    byProject.set(ex.project, list);
  }
  const sessionBreakdown = [...byProject.entries()].map(([project, exs]) => {
    const rows = exs.map(
      (ex) => `  - **${ex.project}**: **${ex.chainLength} consecutive reads**, ${ex.filesExplored} files explored inline (all landed in main context)`
    ).join("\n");
    return `**${project}**
${rows}`;
  }).join("\n\n");
  return {
    detector: "subagent-opportunity",
    title: "Subagent Opportunity",
    severity,
    savingsPercent,
    savingsTokens: estimatedSavings,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
    remediation,
    sessionBreakdown: sessionBreakdown || "_No specific sessions to call out._"
  };
}
function buildSubagentRemediation(evidence, estimatedSavings) {
  const worst = evidence.examples[0];
  const byProject = /* @__PURE__ */ new Map();
  for (const ex of evidence.examples) {
    const existing = byProject.get(ex.project);
    if (!existing || ex.chainLength > existing.maxChain) {
      byProject.set(ex.project, {
        count: (existing?.count ?? 0) + 1,
        maxChain: ex.chainLength,
        filesExplored: ex.filesExplored
      });
    }
  }
  const projectLines = [...byProject.entries()].sort((a, b) => b[1].maxChain - a[1].maxChain).map(([proj, d]) => `**${proj}** (${d.maxChain} consecutive reads, ${d.filesExplored} files)`).join("; ");
  return {
    problem: `${evidence.sessionsWithOpportunity} sessions (${evidence.opportunityRate}%) included long chains of file reads (${evidence.avgChainLength} reads average) that happened directly in the main conversation. Affected projects: ${projectLines || "multiple projects"}. Each file read adds its full content to the context window permanently \u2014 you pay for it on every subsequent turn, even if you only needed one line from that file.`,
    whyItMatters: `When you ask Claude to "explore the codebase" or "understand how this module works," it reads files one by one. ${worst ? `Your worst case was **${worst.project}** with ${worst.chainLength} consecutive reads across ${worst.filesExplored} files \u2014 all that content entered the main context and stayed there for the entire session. ` : ""}The solution: Claude can delegate exploration to an isolated "subagent" session. The subagent reads all the files it needs, but only the summary comes back to your main conversation. The file contents never pollute your context.`,
    steps: [
      {
        action: "Delegate exploration and verbose operations to subagents",
        howTo: "For any task involving broad reading, ask Claude to use a subagent to explore the relevant module and summarize the key files, patterns, and entry points. Subagents are isolated Claude sessions \u2014 they can read, search, and process files without any of that content entering your main conversation. Also delegate: running tests (verbose output stays isolated), processing log files (only errors come back), fetching documentation.",
        impact: `Eliminates ${estimatedSavings > 1e3 ? `${Math.round(estimatedSavings / 1e3)}K` : estimatedSavings} tokens of file content from entering your main context per affected session.`
      },
      {
        action: "Create reusable instruction files for recurring exploration tasks",
        howTo: `If you frequently ask Claude to understand a codebase or module, create a reusable instruction file (e.g., a markdown document) that captures your project's key directories, naming conventions, entry points, and core patterns. When Claude loads these instructions, it gets architecture context instantly \u2014 no file reads needed. This eliminates the exploration chain entirely for "how does this codebase work" questions.`,
        impact: "Prevents exploration chains entirely. One instruction file load replaces 5-20 file reads."
      },
      {
        action: "Use a lighter model for subagent tasks",
        howTo: "When delegating to a subagent, consider requesting a lighter model for mechanical work: file searches, test runs, log parsing, dependency checks. Reserve more capable models for subagents that need deep reasoning or complex analysis. Mechanical exploration tasks produce the same results regardless of model tier.",
        impact: "Subagent tasks on lighter models use 10-20x fewer tokens, making delegation highly efficient from a token perspective."
      }
    ],
    examples: [
      {
        label: "Exploration delegation",
        before: '"Look at the auth module and tell me how it works" \u2192 Claude reads 15 files sequentially, all entering main context',
        after: '"Use a subagent to explore the auth module and summarize the key files and patterns" \u2192 Subagent reads 15 files in isolation, only the 200-word summary enters your main context'
      },
      {
        label: "Test output isolation",
        before: '"Run the full test suite" \u2192 500 lines of test output permanently in your context',
        after: '"Use a subagent to run the tests and report only failures" \u2192 Subagent runs tests, only the 5 failing test names come back'
      }
    ],
    quickWin: 'Next time you ask Claude to explore a module or understand code, prefix your request with: "Use a subagent to..." \u2014 the exploration happens in isolation and only the summary enters your main context.',
    specificQuickWin: (() => {
      const top = evidence.examples.slice(0, 2);
      if (top.length === 0) return 'Prefix exploration requests with "Use a subagent to explore..." to isolate file reads from your main context.';
      const lines = top.map((e) => `**${e.project}**: ${e.chainLength} consecutive reads across ${e.filesExplored} files`);
      const worst2 = top[0];
      return `Longest exploration chains:
${lines.map((l) => `  - ${l}`).join("\n")}
In **${worst2.project}**, those ${worst2.chainLength} file reads all landed in your main context. Next time, ask Claude to use a subagent to explore [module] and summarize the key files \u2014 the reads happen in an isolated session and only the summary comes back.`;
    })(),
    effort: "quick"
  };
}

// src/detectors/claude-md-overhead.ts
import { readFile } from "fs/promises";
import { join as join3 } from "path";
var CONFIG_KEYWORDS = [
  "eslint",
  "prettier",
  "typescript",
  "tsconfig",
  "webpack",
  "vite",
  "babel",
  "jest",
  "vitest"
];
var SKILL_CANDIDATE_PATTERNS = [
  /step-by-step/i,
  /checklist/i,
  /always\s+(do|use|follow)/i,
  /never\s+(do|use)/i,
  /before\s+committing/i,
  /when\s+implementing/i
];
function estimateTokens2(content) {
  return Math.round(content.length / 3.5);
}
function detectConfigDuplication(content) {
  const issues = [];
  const lowerContent = content.toLowerCase();
  for (const keyword of CONFIG_KEYWORDS) {
    if (lowerContent.includes(keyword)) {
      if (lowerContent.includes(`${keyword}config`) || lowerContent.includes(`${keyword}.json`) || lowerContent.includes(`${keyword}.js`) || lowerContent.includes(`"${keyword}"`)) {
        issues.push(`Contains ${keyword} configuration that should be in config file`);
      }
    }
  }
  return issues;
}
function detectSkillCandidates(content) {
  const issues = [];
  for (const pattern of SKILL_CANDIDATE_PATTERNS) {
    if (pattern.test(content)) {
      issues.push("Contains procedural content better suited for an on-demand instruction file");
      break;
    }
  }
  return issues;
}
async function detectClaudeMdOverhead(sessions) {
  if (sessions.length === 0) return null;
  const projectSessions = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    const existing = projectSessions.get(session.projectPath);
    if (existing) {
      existing.push(session);
    } else {
      projectSessions.set(session.projectPath, [session]);
    }
  }
  const findings = [];
  let totalOverhead = 0;
  for (const [projectPath, projectSessionList] of projectSessions) {
    try {
      const claudeMdPath = join3(projectPath, "CLAUDE.md");
      const content = await readFile(claudeMdPath, "utf-8");
      const tokenCount = estimateTokens2(content);
      const issues = [];
      if (tokenCount > 5e3) {
        issues.push("Very large CLAUDE.md (>5K tokens)");
      } else if (tokenCount > 2e3) {
        issues.push("Large CLAUDE.md (>2K tokens)");
      }
      issues.push(...detectConfigDuplication(content));
      issues.push(...detectSkillCandidates(content));
      if (issues.length > 0 || tokenCount > 2e3) {
        const avgTurns = projectSessionList.reduce((sum, s) => sum + s.turnCount, 0) / projectSessionList.length;
        const overhead = Math.round(tokenCount * projectSessionList.length * avgTurns * 0.1);
        totalOverhead += overhead;
        findings.push({
          project: projectSessionList[0]?.project ?? "unknown",
          path: claudeMdPath,
          tokenCount,
          sizeBytes: content.length,
          issues,
          estimatedOverhead: overhead,
          sessionsAffected: projectSessionList.length
        });
      }
    } catch {
    }
  }
  if (findings.length === 0) return null;
  findings.sort((a, b) => b.estimatedOverhead - a.estimatedOverhead);
  const totalTokens = sessions.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreationTokens,
    0
  );
  const savingsPercent = totalTokens > 0 ? Math.round(totalOverhead / totalTokens * 100) : 0;
  const severity = savingsPercent > 10 ? "high" : savingsPercent > 5 ? "medium" : "low";
  const confidence = Math.min(0.85, 0.5 + findings.length * 0.05);
  const remediation = buildClaudeMdRemediation(findings);
  const sessionBreakdown = findings.slice(0, 5).map((f) => {
    const issueList = f.issues.length > 0 ? f.issues.slice(0, 2).join("; ") : "oversized";
    return `**${f.project}**
  - \`${f.path.replace(process.env.HOME ?? "", "~")}\`: **${f.tokenCount.toLocaleString()} tokens** (~${Math.round(f.sizeBytes / 1024)}KB), ${f.sessionsAffected} sessions affected
  - Issues: ${issueList}`;
  }).join("\n\n");
  return {
    detector: "claude-md-overhead",
    title: "CLAUDE.md Overhead",
    severity,
    savingsPercent,
    savingsTokens: totalOverhead,
    confidence: Math.round(confidence * 100) / 100,
    evidence: {
      projectsWithIssues: findings.length,
      worstOffenders: findings.slice(0, 3)
    },
    remediation,
    sessionBreakdown: sessionBreakdown || "_No CLAUDE.md issues found._"
  };
}
function buildClaudeMdRemediation(findings) {
  const worst = findings[0];
  const hasConfigDuplication = findings.some((f) => f.issues.some((i) => i.includes("configuration")));
  const hasSkillCandidates = findings.some((f) => f.issues.some((i) => i.includes("skill")));
  const totalTokens = findings.reduce((sum, f) => sum + f.tokenCount, 0);
  return {
    problem: `CLAUDE.md is a configuration file (CLAUDE.md) that Claude reads at the start of every conversation in that directory. ${findings.length} project(s) have CLAUDE.md files that add unnecessary overhead to every conversation turn. ${worst ? `The worst offender ("${worst.project}") is ${worst.tokenCount.toLocaleString()} tokens (~${Math.round(worst.sizeBytes / 1024)}KB) and is injected into every API call. ` : ""}${hasConfigDuplication ? "Some files duplicate information already in config files (eslintrc, tsconfig, etc.) \u2014 Claude can read those directly. " : ""}${hasSkillCandidates ? "Some files contain step-by-step procedures better suited as on-demand instruction files. " : ""}Every token in a system prompt is paid for on every single turn \u2014 so oversized CLAUDE.md files create a fixed, recurring cost that compounds across sessions.`,
    whyItMatters: `CLAUDE.md content is part of the system prompt, meaning every token in it is charged on every single turn of every conversation. A ${totalTokens.toLocaleString()}-token CLAUDE.md costs that many tokens per turn \u2014 in a 20-turn session, that's ${(totalTokens * 20).toLocaleString()} tokens just for CLAUDE.md content, multiplied across ${findings.reduce((sum, f) => sum + f.sessionsAffected, 0)} affected sessions. Unlike file reads (which happen once and only when needed), this cost repeats on every single API call. Large CLAUDE.md files also crowd out space for actual conversation context and can cause Claude to lose focus on instructions buried in a wall of text.`,
    steps: [
      {
        action: "Audit and trim your CLAUDE.md to essentials",
        howTo: "Keep only: project-specific conventions Claude can't infer from the code, non-obvious architectural decisions, and critical constraints. Remove: obvious patterns Claude already follows, information available in config files, and general coding best practices. Aim for under 1,000 tokens (~3,500 characters). Every token you keep is paid for on every turn.",
        impact: `Reducing from ${totalTokens.toLocaleString()} to ~1,000 tokens saves ${((totalTokens - 1e3) * 20).toLocaleString()} tokens in a 20-turn session.`
      },
      ...hasConfigDuplication ? [{
        action: "Remove config duplication",
        howTo: `Don't repeat ESLint rules, TypeScript settings, or test configuration in CLAUDE.md. Claude can read these files directly when needed. Instead, write: "Follow existing ESLint and TypeScript configurations." One sentence replaces hundreds of tokens that would otherwise be charged on every turn.`,
        impact: "Typically removes 200-800 tokens of duplicated config content."
      }] : [],
      ...hasSkillCandidates ? [{
        action: "Move procedures to on-demand instruction files",
        howTo: "Step-by-step processes (deployment checklists, PR review procedures, release workflows) should live in on-demand instruction files, not CLAUDE.md. On-demand instruction files are loaded only when invoked, not on every turn. Move procedural content to separate files that Claude reads only when needed.",
        impact: "On-demand instruction files eliminate per-turn overhead for content that's only needed occasionally \u2014 you pay for it only when it's used."
      }] : [],
      {
        action: "Use hierarchical CLAUDE.md files",
        howTo: "Put project-wide instructions in the root CLAUDE.md and module-specific instructions in subdirectory CLAUDE.md files. Claude only loads the relevant CLAUDE.md based on the working context, reducing overhead when working on specific modules.",
        impact: "Distributes instructions so only relevant ones are loaded per context, reducing per-turn token overhead."
      }
    ],
    examples: [
      {
        label: "Config duplication removal",
        before: "```\n## TypeScript Rules\n- Use strict mode\n- No any types\n- Use interfaces over types\n- Enable strict null checks\n```\n(~200 tokens, charged on every single turn)",
        after: "```\nFollow tsconfig.json strict settings.\n```\n(~10 tokens, Claude reads tsconfig when needed)"
      },
      {
        label: "Procedure to on-demand instruction file",
        before: 'CLAUDE.md: "## Deployment Checklist\\n1. Run tests\\n2. Build\\n3. Tag version\\n..." (~500 tokens, charged every turn even when not deploying)',
        after: "Moved to a separate instruction file, loaded only when deployment is discussed (~0 tokens per turn, ~500 on demand)"
      }
    ],
    quickWin: `Open your largest CLAUDE.md and delete any lines that describe standard coding practices (like "use meaningful variable names" or "write clean code"). These add overhead on every turn without changing Claude's behavior.`,
    specificQuickWin: (() => {
      const worst2 = findings[0];
      if (!worst2) return "Trim your CLAUDE.md to essentials \u2014 aim for under 1,000 tokens.";
      const issueList = worst2.issues.slice(0, 2).join("; ");
      return `Your heaviest CLAUDE.md: **${worst2.project}** at ${worst2.tokenCount.toLocaleString()} tokens (~${Math.round(worst2.sizeBytes / 1024)}KB) \u2014 every single one charged on every turn. Issues: ${issueList || "oversized"}. Open ${worst2.path.replace(process.env.HOME ?? "", "~")} and cut anything that duplicates config files or describes general coding practices.`;
    })(),
    effort: "moderate"
  };
}

// src/detectors/mcp-tool-tax.ts
import { readFile as readFile2 } from "fs/promises";
import { join as join4 } from "path";
import { homedir as homedir2 } from "os";
var MCP_PREFIXES = ["mcp__", "plugin_"];
function isMcpTool(toolName) {
  return MCP_PREFIXES.some((prefix) => toolName.startsWith(prefix));
}
function extractServerName(toolName) {
  const parts = toolName.split("__");
  if (parts.length >= 2) {
    return parts[1] ?? null;
  }
  return null;
}
async function detectMcpToolTax(sessions) {
  if (sessions.length === 0) return null;
  const serverUsage = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    for (const toolUse of session.toolUses) {
      if (isMcpTool(toolUse.name)) {
        const serverName = extractServerName(toolUse.name);
        if (serverName) {
          if (!serverUsage.has(serverName)) {
            serverUsage.set(serverName, /* @__PURE__ */ new Set());
          }
          serverUsage.get(serverName)?.add(session.id);
        }
      }
    }
  }
  let configuredServers = [];
  try {
    const configPath = join4(homedir2(), ".claude.json");
    const config = JSON.parse(await readFile2(configPath, "utf-8"));
    if (config.mcpServers) {
      configuredServers = Object.keys(config.mcpServers);
    }
  } catch {
  }
  const serverUsages = [];
  for (const serverName of configuredServers) {
    const sessionsUsed = serverUsage.get(serverName)?.size ?? 0;
    const usageRate = sessionsUsed / sessions.length * 100;
    const estimatedOverhead = Math.round((sessions.length - sessionsUsed) * 200);
    serverUsages.push({
      name: serverName,
      sessionsUsed,
      totalSessions: sessions.length,
      usageRate: Math.round(usageRate),
      estimatedOverhead
    });
  }
  for (const [serverName, sessionSet] of serverUsage) {
    if (!configuredServers.includes(serverName)) {
      serverUsages.push({
        name: serverName,
        sessionsUsed: sessionSet.size,
        totalSessions: sessions.length,
        usageRate: Math.round(sessionSet.size / sessions.length * 100),
        estimatedOverhead: 0
      });
    }
  }
  const rarelyUsedServers = serverUsages.filter((s) => s.usageRate > 0 && s.usageRate < 5).sort((a, b) => a.usageRate - b.usageRate);
  const neverUsedServers = serverUsages.filter((s) => s.usageRate === 0).map((s) => s.name);
  if (rarelyUsedServers.length === 0 && neverUsedServers.length === 0) {
    return null;
  }
  const totalOverhead = rarelyUsedServers.reduce((sum, s) => sum + s.estimatedOverhead, 0) + neverUsedServers.length * sessions.length * 200;
  const totalTokens = sessions.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreationTokens,
    0
  );
  const savingsPercent = totalTokens > 0 ? Math.round(totalOverhead / totalTokens * 100) : 0;
  const severity = neverUsedServers.length > 3 || savingsPercent > 5 ? "high" : neverUsedServers.length > 0 || rarelyUsedServers.length > 2 ? "medium" : "low";
  const confidence = Math.min(0.9, 0.5 + sessions.length * 0.01);
  const recommendation = neverUsedServers.length > 0 ? `Disable unused servers: ${neverUsedServers.slice(0, 3).join(", ")}` : rarelyUsedServers.length > 0 ? `Consider disabling rarely-used servers: ${rarelyUsedServers.slice(0, 3).map((s) => s.name).join(", ")}` : "MCP usage is efficient";
  const remediation = buildMcpToolTaxRemediation(configuredServers, rarelyUsedServers, neverUsedServers, sessions.length);
  return {
    detector: "mcp-tool-tax",
    title: "MCP Tool Tax",
    severity,
    savingsPercent,
    savingsTokens: totalOverhead,
    confidence: Math.round(confidence * 100) / 100,
    evidence: {
      serversAnalyzed: configuredServers.length,
      rarelyUsedServers: rarelyUsedServers.slice(0, 5),
      neverUsedServers,
      totalOverhead,
      recommendation
    },
    remediation,
    sessionBreakdown: [
      neverUsedServers.length > 0 ? `**Never used (0/${sessions.length} sessions):** ${neverUsedServers.map((s) => `\`${s}\``).join(", ")}` : "",
      rarelyUsedServers.length > 0 ? `**Rarely used (<5% of sessions):**
${rarelyUsedServers.slice(0, 5).map(
        (s) => `  - \`${s.name}\`: used in ${s.sessionsUsed}/${s.totalSessions} sessions (${s.usageRate}%)`
      ).join("\n")}` : ""
    ].filter(Boolean).join("\n\n") || "_MCP usage is efficient._"
  };
}
function buildMcpToolTaxRemediation(configuredServers, rarelyUsedServers, neverUsedServers, totalSessions) {
  const neverUsedList = neverUsedServers.slice(0, 5).join(", ");
  const rarelyUsedList = rarelyUsedServers.slice(0, 3).map((s) => `${s.name} (${s.usageRate}%)`).join(", ");
  return {
    problem: `MCP (Model Context Protocol) servers are external tool servers that Claude can call during conversations \u2014 for example, a database query server or a web scraping server. Each one you have configured adds overhead to every conversation turn, even when unused. You have ${configuredServers.length} MCP servers configured, but ${neverUsedServers.length > 0 ? `${neverUsedServers.length} were never used in any of your ${totalSessions} sessions` : ""}${neverUsedServers.length > 0 && rarelyUsedServers.length > 0 ? " and " : ""}${rarelyUsedServers.length > 0 ? `${rarelyUsedServers.length} were used in fewer than 5% of sessions` : ""}. ${neverUsedServers.length > 0 ? `Never-used servers: ${neverUsedList}. ` : ""}${rarelyUsedServers.length > 0 ? `Rarely-used: ${rarelyUsedList}. ` : ""}Every loaded server injects its tool definitions into each API request, whether or not those tools are called. This is a fixed per-turn tax on your token budget.`,
    whyItMatters: `Each MCP server typically adds 100-500 tokens of tool definitions to every API request (tool name, description, parameters, schema). Because every loaded server contributes this overhead on every turn \u2014 not just turns where it is used \u2014 the cost compounds quickly. With ${configuredServers.length} servers, that's potentially ${configuredServers.length * 300} tokens of overhead on every single turn across every session. Over ${totalSessions} sessions, unused servers consumed ~${Math.round(neverUsedServers.length * totalSessions * 200 / 1e3)}K tokens for tools that were never called. Beyond cost, excessive tool definitions can confuse Claude's tool selection \u2014 it has to parse and consider tools it will never use, occasionally picking a wrong MCP tool when a built-in tool would be better.`,
    steps: [
      ...neverUsedServers.length > 0 ? [{
        action: `Disable never-used MCP servers: ${neverUsedServers.slice(0, 3).join(", ")}`,
        howTo: "Edit your Claude configuration file to remove or comment out the MCP server entries that you've never used. You can always re-enable them later if needed. Run: `claude config` to review your current server configuration.",
        impact: `Removes ~${neverUsedServers.length * 300} tokens of overhead per turn. Over a 20-turn session, that's ${(neverUsedServers.length * 300 * 20).toLocaleString()} tokens saved.`
      }] : [],
      ...rarelyUsedServers.length > 0 ? [{
        action: "Move rarely-used servers to project-level config",
        howTo: `Instead of configuring ${rarelyUsedList} globally, add them only to the specific project that uses them. In that project's directory, create a Claude configuration file with the MCP server entries. This way, the server only loads when you're working in that project, avoiding overhead everywhere else.`,
        impact: "Eliminates overhead in projects that don't use these servers while keeping them available where needed."
      }] : [],
      {
        action: "Review MCP servers quarterly",
        howTo: "Set a reminder to run this analysis monthly. MCP servers tend to accumulate \u2014 you install one for a project, finish the project, but leave the server configured. A quarterly cleanup prevents drift.",
        impact: "Prevents gradual accumulation of unused overhead."
      }
    ],
    examples: [
      {
        label: "Removing unused servers",
        before: "Claude configuration: 8 MCP servers configured \u2192 ~2,400 tokens overhead per turn \u2192 48,000 tokens per 20-turn session",
        after: "Claude configuration: 3 active MCP servers \u2192 ~900 tokens overhead per turn \u2192 18,000 tokens per 20-turn session (62% reduction)"
      },
      {
        label: "Project-level scoping",
        before: "Global config: database-mcp, figma-mcp, jira-mcp (all loaded in every project)",
        after: "Global: jira-mcp only. Project A config: database-mcp. Project B config: figma-mcp."
      }
    ],
    quickWin: neverUsedServers.length > 0 ? `Open your Claude configuration file and remove "${neverUsedServers[0]}". One server removal saves ~300 tokens per turn across all future sessions.` : `Move "${rarelyUsedServers[0]?.name}" to a project-level configuration to stop it loading in every session.`,
    specificQuickWin: (() => {
      if (neverUsedServers.length > 0) {
        const list = neverUsedServers.slice(0, 4).map((s) => `"${s}"`).join(", ");
        return `Never-used MCP servers (0 of ${totalSessions} sessions): ${list}. Remove them from your Claude configuration file \u2014 every loaded server adds overhead to every single API call, even when unused, so these provide zero benefit while wasting tokens.`;
      }
      const rare = rarelyUsedServers.slice(0, 3).map((s) => `"${s.name}" (${s.usageRate}% of sessions)`).join(", ");
      return `Rarely-used servers: ${rare}. Move these to a project-level Claude configuration file in the specific project that needs them instead of loading globally.`;
    })(),
    effort: "moderate"
  };
}

// src/router.ts
var COMPLEX_KEYWORDS = [
  "design",
  "architecture",
  "schema",
  "system",
  "multi-tenant",
  "refactor",
  "optimize",
  "algorithm",
  "complex",
  "intricate",
  "integration",
  "migration",
  "scalability",
  "security",
  "authentication",
  "authorization",
  "debugging",
  // Reasoning signals
  "plan",
  "combine",
  "compare",
  "analyze",
  "integrate",
  "understand",
  "review",
  "evaluate",
  "investigate",
  "assess",
  "recommend",
  "propose",
  "derive",
  "infer",
  "synthesize"
];
var SIMPLE_KEYWORDS = [
  "fix",
  "typo",
  "rename",
  "format",
  "update",
  "add",
  "remove",
  "delete",
  "show",
  "list",
  "check",
  "test",
  "build",
  "compile",
  "lint",
  "sort",
  "filter"
];
var FILE_REF_PATTERN = /[\w\-./]+\.(ts|js|tsx|jsx|py|java|go|rs|css|html|md|json|yaml|yml)/gi;
var SIMPLE_TOOLS2 = /* @__PURE__ */ new Set(["Read", "Edit", "Write", "Bash", "Glob", "Grep"]);
function hasKeyword(text, keyword) {
  return new RegExp(`\\b${keyword}\\b`, "i").test(text);
}
function hasAnyKeyword(text, keywords) {
  return keywords.some((kw) => hasKeyword(text, kw));
}
function extractSignals(prompt) {
  const words = prompt.trim().split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const hasSimpleKeywords = hasAnyKeyword(prompt, SIMPLE_KEYWORDS);
  const hasComplexKeywords = hasAnyKeyword(prompt, COMPLEX_KEYWORDS);
  const fileMatches = prompt.match(FILE_REF_PATTERN) ?? [];
  const fileReferences = [...new Set(fileMatches)];
  const fileReferenceCount = fileReferences.length;
  const hasUrlReference = /https?:\/\//i.test(prompt);
  const hasCodeBlock = /```/.test(prompt);
  return {
    wordCount,
    hasSimpleKeywords,
    hasComplexKeywords,
    fileReferenceCount,
    fileReferences,
    hasUrlReference,
    hasCodeBlock
  };
}
function buildProjectBaseline(sessions) {
  if (sessions.length === 0) {
    return {
      avgToolCount: 0,
      avgFileSpan: 0,
      simpleSessionRate: 0,
      totalSessions: 0
    };
  }
  const totalTools = sessions.reduce((sum, s) => sum + s.toolUses.length, 0);
  const avgToolCount = totalTools / sessions.length;
  const fileSpans = sessions.map((s) => {
    const files = /* @__PURE__ */ new Set();
    for (const tool of s.toolUses) {
      if (tool.name === "Read" || tool.name === "Edit" || tool.name === "Write") {
        const path = tool.input.path;
        if (path) {
          files.add(path);
        }
      }
    }
    return files.size;
  });
  const avgFileSpan = fileSpans.reduce((sum, count) => sum + count, 0) / sessions.length;
  let simpleCount = 0;
  for (const session of sessions) {
    const toolCount = session.toolUses.length;
    const toolNames = new Set(session.toolUses.map((t) => t.name));
    if (toolCount < 5 && [...toolNames].every((t) => SIMPLE_TOOLS2.has(t))) {
      simpleCount++;
    }
  }
  const simpleSessionRate = sessions.length > 0 ? simpleCount / sessions.length * 100 : 0;
  return {
    avgToolCount: Math.round(avgToolCount * 10) / 10,
    avgFileSpan: Math.round(avgFileSpan * 10) / 10,
    simpleSessionRate: Math.round(simpleSessionRate),
    totalSessions: sessions.length
  };
}
function routePrompt(signals, baseline) {
  const { wordCount, hasSimpleKeywords, hasComplexKeywords, fileReferenceCount, hasUrlReference, hasCodeBlock } = signals;
  const complexSignals = [
    hasComplexKeywords,
    hasUrlReference,
    wordCount > 50,
    fileReferenceCount > 3,
    hasCodeBlock
  ].filter(Boolean).length;
  if (hasComplexKeywords || complexSignals >= 2) {
    return {
      model: "claude-opus-4-6",
      confidence: Math.min(0.95, 0.8 + complexSignals * 0.05),
      reason: hasComplexKeywords ? "Complex reasoning keywords detected" : "Multiple complexity signals detected",
      estimatedSavings: "~0% vs Opus (already optimal)",
      signals
    };
  }
  if (hasUrlReference) {
    return {
      model: "claude-opus-4-6",
      confidence: 0.8,
      reason: "URL reference detected \u2014 likely a research or integration task",
      estimatedSavings: "~0% vs Opus (already optimal)",
      signals
    };
  }
  if (baseline && baseline.simpleSessionRate > 60) {
    return {
      model: "claude-sonnet-4-6",
      confidence: 0.75,
      reason: `Project has ${baseline.simpleSessionRate}% simple sessions \u2014 Sonnet is usually sufficient`,
      estimatedSavings: "~80% vs Opus",
      signals
    };
  }
  if (wordCount < 10 && fileReferenceCount === 0 && !hasComplexKeywords) {
    return {
      model: "claude-sonnet-4-6",
      confidence: 0.7,
      reason: "Simple request \u2014 Sonnet can handle",
      estimatedSavings: "~80% vs Opus",
      signals
    };
  }
  if (wordCount > 50 || fileReferenceCount > 3) {
    return {
      model: "claude-opus-4-6",
      confidence: 0.8,
      reason: fileReferenceCount > 3 ? `References ${fileReferenceCount} files \u2014 likely complex task` : "Detailed prompt \u2014 may require complex reasoning",
      estimatedSavings: "~0% vs Opus (already optimal)",
      signals
    };
  }
  if (hasSimpleKeywords) {
    return {
      model: "claude-sonnet-4-6",
      confidence: 0.85,
      reason: "Simple task keywords detected",
      estimatedSavings: "~80% vs Opus",
      signals
    };
  }
  return {
    model: "claude-sonnet-4-6",
    confidence: 0.7,
    reason: "Default model for general tasks",
    estimatedSavings: "~80% vs Opus",
    signals
  };
}
function routerToDetectorResult(sessions) {
  if (sessions.length === 0) return null;
  const baseline = buildProjectBaseline(sessions);
  if (baseline.simpleSessionRate < 50) {
    return null;
  }
  const simpleSessions = sessions.filter((s) => {
    return s.toolUses.length < 5 && s.toolUses.every((t) => SIMPLE_TOOLS2.has(t.name));
  });
  const simpleSessionTokens = simpleSessions.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens,
    0
  );
  const totalTokens = sessions.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens,
    0
  );
  const savingsPercent = totalTokens > 0 ? Math.round(simpleSessionTokens / totalTokens * 100 * 0.8) : 0;
  const severity = baseline.simpleSessionRate > 70 ? "high" : baseline.simpleSessionRate > 50 ? "medium" : "low";
  return {
    detector: "smart-router",
    title: "Smart Model Routing",
    severity,
    savingsPercent,
    savingsTokens: Math.round(simpleSessionTokens * 0.8),
    // 80% savings
    confidence: 0.75,
    evidence: {
      simpleSessionRate: baseline.simpleSessionRate,
      avgToolCount: baseline.avgToolCount,
      avgFileSpan: baseline.avgFileSpan,
      totalSessions: baseline.totalSessions,
      simpleSessionCount: simpleSessions.length
    },
    remediation: {
      problem: `${baseline.simpleSessionRate}% of your sessions (${simpleSessions.length} of ${baseline.totalSessions}) are simple tasks that could use Sonnet instead of Opus.`,
      whyItMatters: "Sonnet handles simple tasks identically to Opus but uses ~80% fewer tokens. For routine edits, file reads, and small fixes, there's no quality difference.",
      steps: [
        {
          action: "Use Sonnet as default model",
          howTo: "Set Sonnet as your default model in Claude settings or CLAUDE.md",
          impact: "Reduces token usage by ~80% on simple tasks without quality loss"
        },
        {
          action: "Switch to Opus only for complex tasks",
          howTo: "Manually switch to Opus when you need deep reasoning: architecture design, complex debugging, multi-file refactors",
          impact: "Keeps token usage minimal while getting Opus quality when it matters"
        }
      ],
      examples: [
        {
          label: "Simple task - use Sonnet",
          before: 'Running "fix the typo" on Opus uses 5x the tokens for identical result',
          after: "Same task on Sonnet - identical quality, 80% fewer tokens"
        }
      ],
      quickWin: `Set Sonnet as your default model. Your sessions show ${baseline.simpleSessionRate}% are simple tasks where Sonnet matches Opus quality.`,
      specificQuickWin: `${simpleSessions.length} of your ${baseline.totalSessions} sessions are simple (under 5 tools). Use Sonnet for these and save ~80% on tokens.`,
      effort: "quick"
    },
    sessionBreakdown: simpleSessions.slice(0, 5).map(
      (s) => `  - **${s.project}** (${s.startedAt.split("T")[0]}): ${s.toolUses.length} tools, ${s.slug} \u2192 **Sonnet sufficient**`
    ).join("\n") || "_No specific sessions to call out._"
  };
}

// src/detectors/registry.ts
var detectors = [
  { name: "context-snowball", detect: detectContextSnowball },
  { name: "model-selection", detect: detectModelSelection },
  { name: "file-read-waste", detect: detectFileReadWaste },
  { name: "bash-output-bloat", detect: detectBashOutputBloat },
  { name: "vague-prompts", detect: detectVaguePrompts },
  { name: "session-timing", detect: detectSessionTiming },
  { name: "subagent-opportunity", detect: detectSubagentOpportunity }
];
var asyncDetectors = [
  { name: "claude-md-overhead", detect: detectClaudeMdOverhead },
  { name: "mcp-tool-tax", detect: detectMcpToolTax },
  { name: "smart-router", detect: (sessions) => routerToDetectorResult(sessions) }
];
function runAllDetectors(sessions) {
  const findings = [];
  for (const detector of detectors) {
    try {
      const result = detector.detect(sessions);
      if (result && result.confidence > 0.3) {
        findings.push(result);
      }
    } catch (error) {
      console.error(`Detector ${detector.name} failed:`, error);
    }
  }
  findings.sort((a, b) => b.savingsTokens - a.savingsTokens);
  return findings;
}
async function runAsyncDetectors(sessions) {
  const findings = [];
  for (const detector of asyncDetectors) {
    try {
      const result = await detector.detect(sessions);
      if (result && result.confidence > 0.3) {
        findings.push(result);
      }
    } catch (error) {
      console.error(`Async detector ${detector.name} failed:`, error);
    }
  }
  findings.sort((a, b) => b.savingsTokens - a.savingsTokens);
  return findings;
}

// src/report-html.ts
function fmt2(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}
function formatNumber(n) {
  return n.toLocaleString("en-US");
}
function escapeHtml2(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function severityConfig(s) {
  switch (s) {
    case "high":
      return { label: "HIGH", color: "#ff4d6a", glow: "rgba(255,77,106,0.4)", explanation: "Significant token waste \u2014 fix this first for biggest savings" };
    case "medium":
      return { label: "MODERATE", color: "#ffbe2e", glow: "rgba(255,190,46,0.3)", explanation: "Noticeable waste \u2014 worth addressing for better efficiency" };
    case "low":
      return { label: "LOW", color: "#22d3ee", glow: "rgba(34,211,238,0.25)", explanation: "Minor waste \u2014 fix when convenient for incremental savings" };
  }
}
function calculateHealthScore(findings) {
  const totalWastePercent = findings.reduce((sum, f) => sum + f.savingsPercent, 0);
  const penalty = Math.min(100, Math.round(totalWastePercent * 2));
  const score = Math.max(0, 100 - penalty);
  let grade;
  let color;
  if (score >= 90) {
    grade = "A";
    color = "#34d399";
  } else if (score >= 80) {
    grade = "B";
    color = "#22d3ee";
  } else if (score >= 65) {
    grade = "C";
    color = "#ffbe2e";
  } else if (score >= 50) {
    grade = "D";
    color = "#fb923c";
  } else {
    grade = "F";
    color = "#ff4d6a";
  }
  return { score, grade, color };
}
var DETECTOR_DESCRIPTIONS = {
  "context-snowball": "Context grows unboundedly when conversation history accumulates without compaction, making each turn more expensive.",
  "model-selection": "Using the most expensive AI model for tasks that a cheaper model handles equally well.",
  "file-read-waste": "Re-reading files that Claude already has in context, or reading files speculatively without need.",
  "bash-output-bloat": "Running commands that produce large output, all of which permanently enters the conversation context.",
  "vague-prompts": "Starting conversations with unclear instructions, forcing exploration loops that waste tokens.",
  "session-timing": "Running sessions too long without clearing context, causing compounding token growth.",
  "subagent-opportunity": "Doing exploration directly in the main conversation instead of delegating to isolated sub-sessions.",
  "claude-md-overhead": "Large configuration files (CLAUDE.md) that are loaded into every conversation turn, even when irrelevant.",
  "mcp-tool-tax": "External tool servers (MCP) loaded on every session but rarely used, adding overhead to each turn."
};
function getGradeExplanation(grade, score) {
  const explanations = {
    "A": `Score ${score}/100 \u2014 Excellent. Your token usage is highly efficient. Claude Code sessions show minimal waste, good caching habits, and appropriate model selection. Keep doing what you're doing.`,
    "B": `Score ${score}/100 \u2014 Good. Minor optimization opportunities exist. You're using tokens wisely overall, but there are small habits (like clearing context or using subagents) that could push this to an A.`,
    "C": `Score ${score}/100 \u2014 Moderate waste detected. Noticeable token drain from patterns like long sessions without context resets, reading files already in context, or running expensive commands with large output. Addressing 1-2 habits would yield significant savings.`,
    "D": `Score ${score}/100 \u2014 Significant waste. Multiple inefficiency patterns are compounding \u2014 context snowballing, vague prompts, or unused MCP servers loading on every turn. Running \`tokenomics --fix\` and adjusting a few habits could cut token usage substantially.`,
    "F": `Score ${score}/100 \u2014 High waste. Sessions show several overlapping inefficiency patterns that compound over time. The good news: this means large savings are possible. Start with the auto-fixable items and the quick wins listed below.`
  };
  return explanations[grade] ?? `Score ${score}/100 \u2014 Analyze your sessions for optimization opportunities.`;
}
function renderHealthRing(score, color, grade) {
  const circumference = 2 * Math.PI * 54;
  const progress = score / 100 * circumference;
  return `<div class="health-ring-container">
    <svg viewBox="0 0 120 120" class="health-ring">
      <circle cx="60" cy="60" r="54" fill="none" stroke="var(--grid-line)" stroke-width="6" />
      <circle cx="60" cy="60" r="54" fill="none" stroke="${color}" stroke-width="6"
        stroke-dasharray="${progress.toFixed(1)} ${(circumference - progress).toFixed(1)}"
        stroke-dashoffset="${(circumference * 0.25).toFixed(1)}"
        stroke-linecap="round"
        class="ring-progress"
        style="filter: drop-shadow(0 0 8px ${color})" />
      <text x="60" y="52" text-anchor="middle" class="ring-score" fill="${color}">${score}</text>
      <text x="60" y="68" text-anchor="middle" class="ring-grade">GRADE ${grade}</text>
    </svg>
    <div class="health-label">EFFICIENCY INDEX</div>
    <div class="health-explanation">${getGradeExplanation(grade, score)}</div>
  </div>`;
}
function renderDonutChart(input, output, cacheRead, cacheCreation) {
  const total = input + output + cacheRead + cacheCreation;
  if (total === 0) return '<div class="chart-empty">NO DATA</div>';
  const segments = [
    { label: "INPUT", value: input, color: "#22d3ee", desc: "New tokens sent to Claude (prompts, code, tool results) \u2014 you pay full price for these" },
    { label: "OUTPUT", value: output, color: "#a78bfa", desc: "Tokens Claude generated (responses, code, tool calls) \u2014 the most expensive token type" },
    { label: "CACHE READ", value: cacheRead, color: "#34d399", desc: "Input tokens served from cache at 90% discount \u2014 high % here means good cost efficiency" },
    { label: "CACHE WRITE", value: cacheCreation, color: "#ffbe2e", desc: "Tokens written to cache for future reuse \u2014 a one-time cost that pays off in later turns" }
  ].filter((s) => s.value > 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const paths = segments.map((seg) => {
    const pct = seg.value / total;
    const dash = circumference * pct;
    const gap = circumference - dash;
    const el = `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="${seg.color}" stroke-width="14" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 60 60)" class="donut-segment" style="filter: drop-shadow(0 0 4px ${seg.color}40)" />`;
    offset += dash;
    return el;
  });
  const legend = segments.map((seg) => {
    const pct = (seg.value / total * 100).toFixed(1);
    return `<div class="legend-item" data-tooltip="${escapeHtml2(seg.desc)}">
      <span class="legend-dot" style="background:${seg.color};box-shadow:0 0 6px ${seg.color}60"></span>
      <span class="legend-label">${seg.label}</span>
      <span class="legend-value">${fmt2(seg.value)} <span class="legend-pct">${pct}%</span></span>
    </div>`;
  }).join("");
  return `<div class="donut-container">
  <svg viewBox="0 0 120 120" class="donut-chart">
    ${paths.join("\n    ")}
    <text x="60" y="56" text-anchor="middle" class="donut-total">${fmt2(total)}</text>
    <text x="60" y="70" text-anchor="middle" class="donut-label">TOKENS</text>
  </svg>
  <div class="donut-legend">
    ${legend}
    <div class="legend-hint">Hover each category for details. Cache reads are 90% cheaper than regular input.</div>
  </div>
</div>`;
}
function renderSavingsBar(findings) {
  if (findings.length === 0) return "";
  const totalSavingsTokens = findings.reduce((sum, f) => sum + f.savingsTokens, 0);
  const bars = findings.map((f, i) => {
    const widthPct = totalSavingsTokens > 0 ? Math.max(2, f.savingsTokens / totalSavingsTokens * 100) : 0;
    const sev = severityConfig(f.severity);
    const description = DETECTOR_DESCRIPTIONS[f.detector] ?? f.remediation.problem.slice(0, 120);
    return `<div class="bar-row" style="animation-delay:${i * 80}ms">
  <span class="bar-label"><span class="bar-label-text" data-tooltip="${escapeHtml2(description)}">${escapeHtml2(f.title)} <span class="bar-info">&#9432;</span></span></span>
  <div class="bar-track">
    <div class="bar-fill" style="width:${widthPct.toFixed(1)}%;background:${sev.color};box-shadow:0 0 8px ${sev.glow}"></div>
  </div>
  <span class="bar-value" style="color:${sev.color}">~${fmt2(f.savingsTokens)}</span>
</div>`;
  }).join("\n");
  return `<div class="savings-bars">${bars}</div>`;
}
function renderHeader(metadata) {
  const days = Math.round(
    (new Date(metadata.dateRange.end).getTime() - new Date(metadata.dateRange.start).getTime()) / 864e5
  ) || 30;
  const dateStr = new Date(metadata.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  return `<header class="cmd-header">
  <div class="cmd-header-top">
    <div class="cmd-brand">
      <div class="cmd-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
          <path d="M12 2.5L2.5 7.75v8.5L12 21.5l9.5-5.25v-8.5L12 2.5z"/>
          <path d="M12 12V21.5M12 12l9.5-4.25M12 12L2.5 7.75"/>
        </svg>
      </div>
      <div class="cmd-titles">
        <h1 class="cmd-title gradient-text">TOKENOMICS</h1>
        <p class="cmd-subtitle">${metadata.sessionCount} sessions // ${days} day range // ${dateStr}</p>
      </div>
    </div>
    <div class="cmd-controls">
      <div class="cmd-status">
        <span class="status-dot"></span>
        <span class="typing-status">ANALYSIS COMPLETE</span>
      </div>
      <button class="cmd-theme-btn" onclick="toggleTheme()" title="Toggle theme">
        <svg viewBox="0 0 24 24" class="icon-theme" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
        <svg viewBox="0 0 24 24" class="icon-theme-alt" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>
    </div>
  </div>
  <nav class="cmd-nav">
    <a href="#overview" class="cmd-nav-link active" data-section="overview">Overview</a>
    <a href="#findings" class="cmd-nav-link" data-section="findings">Findings</a>
    <a href="#actions" class="cmd-nav-link" data-section="actions">Actions</a>
  </nav>
</header>`;
}
function renderDashboard(metadata, findings) {
  const { score, grade, color } = calculateHealthScore(findings);
  const totalTokens = metadata.totalTokens;
  const cacheHitRate = totalTokens.total > 0 ? (totalTokens.cacheRead / totalTokens.total * 100).toFixed(1) : "0";
  const totalSavings = findings.reduce((s, f) => s + f.savingsPercent, 0);
  return `<details class="section-collapsible" id="collapsible-overview" open>
  <summary class="section-collapsible-summary">
    <svg viewBox="0 0 24 24" class="section-collapsible-chevron" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    Overview
  </summary>
  <section class="dashboard section-collapsible-content" id="overview">
  <div class="bento-grid">

    <!-- Health ring -->
    <div class="bento-card bento-health">
        ${renderHealthRing(score, color, grade)}
    </div>

    <!-- Sessions metric -->
    <div class="bento-card bento-sessions">
      <span class="metric-val"><span class="number-ticker" data-target="${metadata.sessionCount}">${formatNumber(metadata.sessionCount)}</span></span>
      <span class="metric-key">SESSIONS</span>
      <span class="metric-hint">Claude Code conversations analyzed</span>
    </div>

    <!-- Total tokens metric -->
    <div class="bento-card bento-tokens">
      <span class="metric-val"><span class="number-ticker" data-target="${totalTokens.total}" data-suffix="">${fmt2(totalTokens.total)}</span></span>
      <span class="metric-key">TOTAL TOKENS</span>
      <span class="metric-hint">Input + output + cache across all sessions</span>
    </div>

    <!-- Cache hit rate metric -->
    <div class="bento-card bento-cache">
      <span class="metric-val"><span class="number-ticker" data-target="${parseFloat(cacheHitRate)}" data-suffix="%" data-decimals="1">${cacheHitRate}<span class="metric-unit">%</span></span></span>
      <span class="metric-key">CACHE HIT RATE</span>
      <span class="metric-hint">% of input tokens served from cache (higher = cheaper)</span>
      <span class="metric-bar" style="--bar-fill:${cacheHitRate}%;--bar-color:#34d399"></span>
    </div>

    <!-- Issues count metric -->
    <div class="bento-card bento-issues">
      <span class="metric-val"><span class="number-ticker" data-target="${findings.length}">${findings.length}</span></span>
      <span class="metric-key">ISSUES</span>
      <span class="metric-hint">Optimization opportunities detected</span>
    </div>

    <!-- Token breakdown donut -->
    <div class="bento-card bento-donut">
      <div class="panel-header">
        <span class="panel-tag">01</span>
        <h3 class="panel-title">TOKEN BREAKDOWN</h3>
      </div>
      <div class="panel-body">
        ${renderDonutChart(totalTokens.input, totalTokens.output, totalTokens.cacheRead, totalTokens.cacheCreation)}
      </div>
    </div>

    <!-- Potential savings bars -->
    <div class="bento-card bento-savings">
      <div class="panel-header">
        <span class="panel-tag">02</span>
        <h3 class="panel-title">POTENTIAL SAVINGS</h3>
      </div>
      <div class="panel-body">
        ${renderSavingsBar(findings)}
        <div class="savings-total">
          <span class="savings-total-label">COMBINED POTENTIAL</span>
          <span class="savings-total-value">~${totalSavings}% <span class="savings-total-unit">TOKEN REDUCTION</span></span>
        </div>
      </div>
    </div>

  </div>
</section>
</details>`;
}
function renderUnifiedFindings(findings) {
  if (findings.length === 0) {
    return '<section class="findings-unified" id="findings"><div class="panel"><div class="panel-body no-findings">NO SIGNIFICANT PATTERNS DETECTED</div></div></section>';
  }
  const findingCards = findings.map((f) => {
    const block = extractHumanReadableBlock(f);
    return renderHtmlBlock(block, f.severity);
  }).join("\n");
  const uniqueDetectors = [...new Set(findings.map((f) => f.detector))].sort();
  const detectorOptions = uniqueDetectors.map((d) => `<option value="${escapeHtml2(d)}">${escapeHtml2(d)}</option>`).join("");
  const toolbar = `<div class="findings-toolbar">
    <div class="filter-group">
      <label class="filter-chip" data-sev-filter="high">
        <input type="checkbox" value="high" checked />
        <span class="filter-chip-label" style="--chip-color:var(--red)">HIGH</span>
      </label>
      <label class="filter-chip" data-sev-filter="medium">
        <input type="checkbox" value="medium" checked />
        <span class="filter-chip-label" style="--chip-color:var(--amber)">MODERATE</span>
      </label>
      <label class="filter-chip" data-sev-filter="low">
        <input type="checkbox" value="low" checked />
        <span class="filter-chip-label" style="--chip-color:var(--accent)">LOW</span>
      </label>
    </div>
    <div class="filter-group">
      <select class="filter-select" id="detector-filter">
        <option value="">All detectors</option>
        ${detectorOptions}
      </select>
    </div>
    <span class="findings-count" id="findings-count">${findings.length} of ${findings.length} issues</span>
    <button class="clear-filters-btn" id="clear-filters" style="display:none">Clear filters</button>
  </div>`;
  return `<details class="section-collapsible" id="collapsible-findings" open>
  <summary class="section-collapsible-summary">
    <svg viewBox="0 0 24 24" class="section-collapsible-chevron" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    Findings
  </summary>
  <section class="findings-unified section-collapsible-content" id="findings">
  <div class="panel">
    <div class="panel-header">
      <span class="panel-tag">04</span>
      <h3 class="panel-title">FINDINGS</h3>
      <span class="panel-count">${findings.length} issue${findings.length !== 1 ? "s" : ""}</span>
    </div>
    <div class="panel-body panel-body--flush">
      ${toolbar}
      <div class="findings-cards">
      ${findingCards}
      <div class="empty-state" style="display:none">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <p>No findings match your filters</p>
      </div>
      </div>
  </div>
</section>
</details>`;
}
function renderFixSuggestions(findings) {
  const autoFixable = findings.filter((f) => f.detector === "model-selection" || f.detector === "mcp-tool-tax");
  const manual = findings.filter((f) => f.detector !== "model-selection" && f.detector !== "mcp-tool-tax");
  const autoFixItems = autoFixable.map((f) => {
    const sev = severityConfig(f.severity);
    const step = f.remediation.steps[0];
    return `<li>
      <div class="action-item-header">
        <span class="sev-indicator" style="background:${sev.color};box-shadow:0 0 6px ${sev.glow}"></span>
        <span class="action-cmd">${escapeHtml2(step?.action ?? f.title)}</span>
        <span class="action-savings" style="color:${sev.color}">~${f.savingsPercent}% savings</span>
      </div>
      <span class="action-detail">${escapeHtml2(step?.impact ?? f.remediation.whyItMatters)}</span>
    </li>`;
  }).join("\n");
  const dynamicFixSteps = [];
  const hasModelSelection = autoFixable.some((f) => f.detector === "model-selection");
  const hasMcpTax = autoFixable.some((f) => f.detector === "mcp-tool-tax");
  dynamicFixSteps.push("Scans your last 30 days of Claude Code sessions for optimization opportunities");
  if (hasModelSelection) {
    dynamicFixSteps.push("Updates your settings to use Sonnet as the default model (5x cheaper for most tasks)");
  }
  if (hasMcpTax) {
    dynamicFixSteps.push("Removes MCP servers that were loaded every session but never actually used");
  }
  dynamicFixSteps.push("Reports exactly what changed and what still needs your manual attention");
  const manualItems = manual.slice(0, 5).map((f) => {
    const sev = severityConfig(f.severity);
    const step = f.remediation.steps[0];
    if (!step) return "";
    return `<li>
      <div class="action-item-header">
        <span class="sev-indicator" style="background:${sev.color};box-shadow:0 0 6px ${sev.glow}"></span>
        <span class="action-cmd">${escapeHtml2(step.action)}</span>
        <span class="action-savings" style="color:${sev.color}">~${f.savingsPercent}% savings</span>
      </div>
    </li>`;
  }).filter(Boolean).join("\n");
  return `<details class="section-collapsible" id="collapsible-actions" open>
  <summary class="section-collapsible-summary">
    <svg viewBox="0 0 24 24" class="section-collapsible-chevron" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    Actions
  </summary>
  <section class="fix-suggestions section-collapsible-content" id="actions">
  <div class="panel">
    <div class="panel-header">
      <span class="panel-tag">03</span>
      <h3 class="panel-title">ACTIONS</h3>
    </div>
    <div class="panel-body">
      <div class="actions-grid">
        <div class="action-card action-auto">
          <div class="action-card-header">
            <span class="action-status-dot" style="background:#34d399;box-shadow:0 0 8px rgba(52,211,153,0.5)"></span>
            <h4>AUTO-FIXABLE</h4>
          </div>
          ${autoFixable.length > 0 ? `<p class="action-intro">These fixes run locally (no LLM needed) and edit your Claude configuration files directly.</p>
               <ul class="action-list">${autoFixItems}</ul>` : `<p class="action-intro">No auto-fixable issues detected in this scan. Run <code>tokenomics --fix</code> to check again after changing your workflow.</p>`}
          <div class="action-cli-block">
            <div class="action-cli-label">Run in your terminal:</div>
            <div class="action-cli action-cli--prominent">
              <div class="cli-prompt">$</div>
              <code>tokenomics --fix</code>
            </div>
            <div class="action-cli-options">
              <div class="cli-option"><code>tokenomics --fix --dry-run</code><span>Preview changes without writing files</span></div>
              <div class="cli-option"><code>tokenomics --fix --json</code><span>Machine-readable JSON output</span></div>
            </div>
            <div class="action-cli-steps">
              <div class="cli-step-title">What <code>--fix</code> does, step by step:</div>
              <ol class="cli-steps-list">
                ${dynamicFixSteps.map((s) => `<li>${s}</li>`).join("\n                ")}
              </ol>
            </div>
          </div>
        </div>
        <div class="action-card action-manual">
          <div class="action-card-header">
            <span class="action-status-dot" style="background:#ffbe2e;box-shadow:0 0 8px rgba(255,190,46,0.5)"></span>
            <h4>BEHAVIORAL CHANGES</h4>
          </div>
          <p class="action-intro">These require changing how you interact with Claude. No script can automate these \u2014 they are habits that compound over time.</p>
          <ul class="action-list">
            ${manualItems || '<li><span class="action-detail">No behavioral changes needed \u2014 your patterns look efficient.</span></li>'}
          </ul>
        </div>
      </div>
    </div>
  </div>
</section>
</details>`;
}
function renderFooter(metadata) {
  const dateStr = new Date(metadata.generatedAt).toLocaleString("en-US");
  return `<footer class="cmd-footer">
  <span class="footer-marker">&gt;_</span>
  <span>Generated ${dateStr}</span>
  <span class="footer-sep">|</span>
  <span>Tokenomics v${metadata.version}</span>
  <span class="footer-sep">|</span>
  <span class="footer-blink">READY</span>
</footer>`;
}
function renderStyles() {
  return `<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap');

/* \u2500\u2500 Custom Properties \u2500\u2500 */
:root {
  --bg-base: #111827;
  --bg-surface: #1e293b;
  --bg-elevated: #283548;
  --bg-hover: #334155;
  --grid-line: rgba(255,255,255,0.07);
  --grid-line-strong: rgba(255,255,255,0.12);
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --accent: #22d3ee;
  --accent-glow: rgba(34,211,238,0.15);
  --green: #34d399;
  --amber: #ffbe2e;
  --red: #ff4d6a;
  --purple: #a78bfa;
  --radius: 6px;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
  --font-sans: 'DM Sans', system-ui, -apple-system, sans-serif;

  --dot-color: rgba(255,255,255,0.04);
}

[data-theme="light"] {
  --bg-base: #f8fafc;
  --bg-surface: #ffffff;
  --bg-elevated: #f1f5f9;
  --bg-hover: #e2e8f0;
  --grid-line: rgba(0,0,0,0.06);
  --grid-line-strong: rgba(0,0,0,0.12);
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --accent: #0891b2;
  --accent-glow: rgba(8,145,178,0.08);
  --green: #059669;
  --amber: #d97706;
  --red: #dc2626;
  --purple: #7c3aed;
  --dot-color: rgba(0,0,0,0.05);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { font-size: 14px; -webkit-font-smoothing: antialiased; scroll-behavior: smooth; }

body {
  font-family: var(--font-mono);
  background: var(--bg-base);
  color: var(--text-primary);
  line-height: 1.6;
  min-height: 100vh;
  position: relative;
}

/* \u2500\u2500 Dot Pattern background \u2500\u2500 */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: radial-gradient(circle, var(--dot-color) 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
  z-index: 0;
}

.report-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px 48px;
  position: relative;
  z-index: 1;
}

/* \u2500\u2500 Title \u2500\u2500 */
.gradient-text {
  background: linear-gradient(90deg, #22d3ee, #a78bfa, #34d399);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* \u2500\u2500 Health card (no animation) \u2500\u2500 */

/* \u2500\u2500 Health explanation \u2500\u2500 */

/* \u2500\u2500 Status text \u2500\u2500 */
.typing-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* \u2500\u2500 MagicUI #3: Number Ticker \u2500\u2500 */
.number-ticker {
  display: inline-block;
  font-variant-numeric: tabular-nums;
  transition: none;
}

/* \u2500\u2500 MagicUI #1: Bento Grid \u2500\u2500 */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-template-rows: auto auto;
  gap: 12px;
  margin-bottom: 16px;
}

.bento-health   { grid-column: span 2; grid-row: span 2; }
.bento-sessions { grid-column: span 2; }
.bento-tokens   { grid-column: span 2; }
.bento-cache    { grid-column: span 2; }
.bento-issues   { grid-column: span 2; }
.bento-donut    { grid-column: span 3; }
.bento-savings  { grid-column: span 3; }

/* Keep donut and savings panels equal height */
.bento-grid .bento-donut,
.bento-grid .bento-savings {
  display: flex;
  flex-direction: column;
}

.bento-card {
  background: var(--bg-surface);
  border: 1px solid var(--grid-line-strong);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  animation: bento-fade-in 0.5s ease backwards;
}

.bento-donut,
.bento-savings {
  align-items: stretch;
  text-align: left;
  padding: 0;
}

/* Stretch panel-body inside donut/savings so cards match height */
.bento-donut .panel-body,
.bento-savings .panel-body {
  flex: 1;
  padding: 20px;
}

.bento-donut .panel-body {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

@keyframes bento-fade-in {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

.bento-health   { animation-delay: 0ms; }
.bento-sessions { animation-delay: 60ms; }
.bento-tokens   { animation-delay: 120ms; }
.bento-cache    { animation-delay: 180ms; }
.bento-issues   { animation-delay: 240ms; }
.bento-donut    { animation-delay: 300ms; }
.bento-savings  { animation-delay: 360ms; }

/* \u2500\u2500 Header \u2500\u2500 */
.cmd-header { margin-bottom: 32px; }

.cmd-header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0;
  border-bottom: 1px solid var(--grid-line-strong);
}

.cmd-brand { display: flex; align-items: center; gap: 14px; }

.cmd-logo {
  width: 36px; height: 36px;
  color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  padding: 6px;
}
.cmd-logo svg { width: 100%; height: 100%; }

.cmd-title {
  font-family: var(--font-sans);
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.cmd-subtitle {
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  margin-top: 2px;
}

.cmd-controls { display: flex; align-items: center; gap: 16px; }

.cmd-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.7rem;
  color: var(--green);
  letter-spacing: 0.06em;
}

.status-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 8px rgba(52,211,153,0.6);
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(52,211,153,0.6); }
  50% { opacity: 0.5; box-shadow: 0 0 4px rgba(52,211,153,0.3); }
}

.cmd-theme-btn {
  background: var(--bg-surface);
  border: 1px solid var(--grid-line-strong);
  border-radius: var(--radius);
  padding: 6px;
  cursor: pointer;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-secondary);
  transition: all 0.2s;
}
.cmd-theme-btn:hover { border-color: var(--accent); color: var(--accent); }

.icon-theme, .icon-theme-alt { width: 18px; height: 18px; }
[data-theme="light"] .icon-theme { display: none; }
:not([data-theme]) .icon-theme-alt, [data-theme="light"] .icon-theme-alt { display: none; }
:not([data-theme]) .icon-theme, [data-theme="dark"] .icon-theme { display: block; }
[data-theme="dark"] .icon-theme-alt { display: none; }
[data-theme="light"] .icon-theme-alt { display: block; }

.cmd-nav {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--grid-line);
}

.cmd-nav-link {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  text-decoration: none;
  padding: 12px 20px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}
.cmd-nav-link:hover { color: var(--text-secondary); background: var(--bg-hover); }
.cmd-nav-link.active { color: var(--accent); border-bottom-color: var(--accent); }

/* \u2500\u2500 Metric blocks in bento cells \u2500\u2500 */
.metric-val {
  font-family: var(--font-sans);
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1;
  margin-bottom: 6px;
}

.metric-unit {
  font-size: 0.9rem;
  color: var(--text-secondary);
  font-weight: 400;
}

.metric-key {
  font-size: 0.62rem;
  color: var(--text-muted);
  letter-spacing: 0.1em;
  font-weight: 500;
}

.metric-bar {
  width: 100%;
  height: 2px;
  background: var(--grid-line);
  margin-top: 10px;
  border-radius: 1px;
  position: relative;
  overflow: hidden;
}
.metric-bar::after {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: var(--bar-fill, 50%);
  background: var(--bar-color, var(--accent));
  border-radius: 1px;
  transition: width 1s ease;
}

.metric-hint { font-size: 0.6rem; color: var(--text-secondary); letter-spacing: 0.02em; margin-top: 6px; text-align: center; max-width: 180px; line-height: 1.4; font-family: var(--font-sans); }

/* Health Ring */
.health-ring-container { display: flex; flex-direction: column; align-items: center; }
.health-ring { width: 90px; height: 90px; }
.ring-progress { transition: stroke-dasharray 1.5s ease; }
.ring-score { font-size: 1.8rem; font-weight: 800; font-family: var(--font-sans); }
.ring-grade { font-size: 0.55rem; fill: var(--text-muted); letter-spacing: 0.12em; font-family: var(--font-mono); }
.health-label { font-size: 0.58rem; color: var(--text-muted); letter-spacing: 0.1em; margin-top: 6px; }
.health-hint { font-size: 0.56rem; color: var(--text-secondary); text-align: center; max-width: 180px; line-height: 1.5; margin-top: 4px; font-family: var(--font-sans); }
.health-explanation { font-size: 0.62rem; color: var(--text-secondary); text-align: center; max-width: 220px; line-height: 1.6; margin-top: 8px; font-family: var(--font-sans); }

/* \u2500\u2500 Panels \u2500\u2500 */
.panel {
  background: var(--bg-surface);
  border: 1px solid var(--grid-line-strong);
  border-radius: var(--radius);
  overflow: visible;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--grid-line);
}

.panel-tag {
  font-size: 0.62rem;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  font-weight: 600;
  opacity: 0.6;
}

.panel-title {
  font-family: var(--font-sans);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}

.panel-count {
  margin-left: auto;
  font-size: 0.65rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  background: var(--bg-elevated);
  padding: 2px 10px;
  border-radius: 10px;
}

.panel-body { padding: 20px; }
.panel-body--flush { padding: 0; }

/* \u2500\u2500 Donut \u2500\u2500 */
.donut-container { display: flex; gap: 24px; align-items: center; justify-content: center; width: 100%; min-height: 140px; }
.donut-chart { width: 130px; height: 130px; flex-shrink: 0; }
.donut-segment { transition: stroke-width 0.2s; }
.donut-total { font-size: 1rem; font-weight: 700; fill: var(--text-primary); font-family: var(--font-sans); }
.donut-label { font-size: 0.45rem; fill: var(--text-muted); letter-spacing: 0.12em; font-family: var(--font-mono); }
.donut-legend { display: flex; flex-direction: column; gap: 10px; flex: 1; }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; }
.legend-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.legend-label { color: var(--text-muted); min-width: 70px; font-size: 0.68rem; letter-spacing: 0.05em; }
.legend-value { color: var(--text-primary); font-weight: 600; font-variant-numeric: tabular-nums; }
.legend-pct { color: var(--text-muted); font-weight: 400; margin-left: 4px; }
.legend-hint { font-size: 0.6rem; color: var(--text-secondary); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--grid-line); line-height: 1.5; font-family: var(--font-sans); }

/* \u2500\u2500 Savings Bars \u2500\u2500 */
.savings-bars { display: flex; flex-direction: column; gap: 12px; }
.bar-row { display: grid; grid-template-columns: 130px 1fr 80px; gap: 10px; align-items: center; font-size: 0.72rem; animation: slideInRight 0.5s ease backwards; }
.bar-label { text-align: right; overflow: visible; white-space: nowrap; font-size: 0.7rem; }
.bar-label-text { color: var(--text-secondary); position: relative; }
.bar-info { opacity: 0.4; font-size: 0.6rem; margin-left: 2px; cursor: help; }
.bar-label-text:hover .bar-info { opacity: 1; color: var(--accent); }

/* Tooltip */
.tooltip-popup {
  position: fixed;
  z-index: 99999;
  background: var(--bg-elevated);
  border: 1px solid var(--grid-line-strong);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 0.72rem;
  color: var(--text-secondary);
  white-space: normal;
  width: 320px;
  max-width: 85vw;
  text-align: left;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  pointer-events: none;
  line-height: 1.7;
  font-family: var(--font-mono);
  opacity: 0;
  transition: opacity 0.15s;
}
.tooltip-popup.visible { opacity: 1; }
.tooltip-popup::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: var(--grid-line-strong);
}
[data-tooltip] { cursor: help; }

.bar-track { height: 6px; background: var(--grid-line-strong); border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; transition: width 1.2s cubic-bezier(0.16,1,0.3,1); }
.bar-value { font-weight: 600; font-size: 0.72rem; font-variant-numeric: tabular-nums; }

.savings-total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--grid-line);
}
.savings-total-label { font-size: 0.68rem; color: var(--text-muted); letter-spacing: 0.06em; }
.savings-total-value { font-family: var(--font-sans); font-size: 1.1rem; font-weight: 700; color: var(--green); }
.savings-total-unit { font-size: 0.6rem; color: var(--text-muted); font-weight: 400; margin-left: 4px; letter-spacing: 0.05em; }

/* \u2500\u2500 Unified Findings \u2500\u2500 */
.findings-unified { margin-bottom: 16px; }

/* \u2500\u2500 Finding Cards (Human Readable) \u2500\u2500 */
.findings-cards {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.finding-card {
  border-bottom: 1px solid var(--grid-line);
  transition: background 0.15s;
}

.finding-card:last-child { border-bottom: none; }
.finding-card:hover { background: var(--bg-hover); }
.finding-card.finding-hidden { display: none; }

.finding-card > summary {
  padding: 16px 24px;
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.finding-card > summary::-webkit-details-marker { display: none; }

.finding-card-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1;
}

.finding-card-chevron {
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-top: 2px;
  transition: transform 0.2s;
}
.finding-card[open] > summary .finding-card-chevron {
  transform: rotate(180deg);
}

.finding-card-title {
  font-weight: 600;
  font-size: 0.88rem;
  line-height: 1.5;
}

.finding-card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 24px 16px 52px;
}

.finding-card-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.finding-card-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.finding-card-text {
  font-size: 0.82rem;
  line-height: 1.65;
  color: var(--text-secondary);
  margin: 0;
}

.finding-card-action .finding-card-text {
  color: var(--accent);
  font-weight: 500;
}

/* \u2500\u2500 Filter Toolbar \u2500\u2500 */
.findings-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--grid-line);
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-chip {
  cursor: pointer;
  position: relative;
}
.filter-chip input[type="checkbox"] {
  position: absolute;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  width: 1px;
  height: 1px;
  overflow: hidden;
  white-space: nowrap;
}
.filter-chip input[type="checkbox"]:focus-visible + .filter-chip-label {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.filter-chip-label {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  border: 1px solid var(--chip-color, var(--text-muted));
  color: var(--chip-color, var(--text-muted));
  background: transparent;
  transition: all 0.15s;
}
.filter-chip input:checked + .filter-chip-label {
  background: var(--chip-color, var(--text-muted));
  color: var(--bg-base);
  border-color: var(--chip-color, var(--text-muted));
}
.filter-chip:hover .filter-chip-label {
  opacity: 0.85;
}

.filter-select {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--grid-line-strong);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 24px;
}

.findings-count {
  font-size: 0.65rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  background: var(--bg-elevated);
  padding: 3px 10px;
  border-radius: 10px;
  margin-left: auto;
}

.clear-filters-btn {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--accent);
  background: none;
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 3px 10px;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: all 0.15s;
}
.clear-filters-btn:hover {
  background: var(--accent);
  color: var(--bg-base);
}

.finding-hidden {
  display: none;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text-muted);
  gap: 12px;
}
.empty-state svg {
  opacity: 0.4;
}
.empty-state p {
  font-size: 0.78rem;
  letter-spacing: 0.04em;
}

/* \u2500\u2500 Meaning card \u2500\u2500 */
.meaning-problem {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.82rem;
  line-height: 1.6;
  margin-bottom: 8px;
}
.meaning-context {
  color: var(--text-muted);
  font-size: 0.74rem;
  font-style: italic;
  line-height: 1.5;
}

/* \u2500\u2500 Section collapsible \u2500\u2500 */
.section-collapsible {
  margin-bottom: 16px;
}
.section-collapsible > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  list-style: none;
  user-select: none;
  border-bottom: 1px solid var(--grid-line);
  margin-bottom: 0;
}
.section-collapsible > summary::-webkit-details-marker { display: none; }
.section-collapsible > summary .section-collapsible-chevron {
  width: 14px;
  height: 14px;
  transition: transform 0.2s;
}
.section-collapsible[open] > summary .section-collapsible-chevron {
  transform: rotate(180deg);
}
.section-collapsible > summary:hover {
  color: var(--text-secondary);
}
/* \u2500\u2500 Actions \u2500\u2500 */
.fix-suggestions { margin-bottom: 16px; }

.actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.action-card {
  background: var(--bg-elevated);
  border: 1px solid var(--grid-line-strong);
  border-radius: var(--radius);
  padding: 18px;
}

.action-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.action-card-header h4 {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.action-intro {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-bottom: 12px;
  line-height: 1.5;
}

.action-status-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
}

.action-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.action-list li {
  font-size: 0.76rem;
  line-height: 1.6;
  padding-left: 14px;
  position: relative;
  margin-bottom: 6px;
  white-space: normal;
  overflow: visible;
}
.action-list li::before {
  content: '';
  position: absolute;
  left: 0; top: 8px;
  width: 4px; height: 4px;
  border-radius: 1px;
  background: var(--text-muted);
}

.action-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.action-cmd { font-weight: 600; color: var(--text-primary); }
.action-savings { font-size: 0.68rem; font-weight: 700; margin-left: auto; }
.action-detail { color: var(--text-secondary); line-height: 1.5; display: block; font-size: 0.76rem; }

.action-cli-block {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--grid-line);
}
.action-cli-label {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.action-cli {
  padding: 14px 16px;
  background: var(--bg-base);
  border: 1px solid var(--grid-line-strong);
  border-radius: var(--radius);
  position: relative;
}
.action-cli--prominent {
  border-color: var(--green);
  box-shadow: 0 0 12px rgba(52,211,153,0.15), inset 0 0 12px rgba(52,211,153,0.05);
  padding: 18px 16px;
}
.action-cli--prominent code {
  font-size: 1rem;
  color: var(--green);
}
.cli-prompt {
  position: absolute;
  top: 12px; left: 16px;
  color: var(--green);
  font-size: 0.82rem;
  font-weight: 700;
}
.action-cli code {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.88rem;
  font-weight: 600;
  padding-left: 20px;
  word-break: break-all;
  color: var(--text-primary);
}
.action-cli-options {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cli-option {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.72rem;
}
.cli-option code {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-primary);
  background: var(--bg-base);
  padding: 2px 8px;
  border-radius: 3px;
  border: 1px solid var(--grid-line);
  white-space: nowrap;
}
.cli-option span {
  color: var(--text-muted);
  font-size: 0.68rem;
}
.action-cli-steps {
  margin-top: 16px;
  padding: 14px 16px;
  background: var(--bg-base);
  border: 1px solid var(--grid-line);
  border-radius: var(--radius);
}
.cli-step-title {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
}
.cli-step-title code { font-size: 0.72rem; color: var(--accent); background: none; border: none; padding: 0; }
.cli-steps-list {
  list-style: none;
  counter-reset: step;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cli-steps-list li {
  counter-increment: step;
  font-size: 0.72rem;
  color: var(--text-secondary);
  line-height: 1.5;
  padding-left: 28px;
  position: relative;
}
.cli-steps-list li::before {
  content: counter(step);
  position: absolute;
  left: 0; top: 0;
  width: 20px; height: 20px;
  background: var(--bg-elevated);
  border: 1px solid var(--grid-line-strong);
  border-radius: 50%;
  font-size: 0.58rem;
  font-weight: 700;
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cli-steps-list li code { font-size: 0.68rem; color: var(--text-primary); background: var(--bg-elevated); padding: 1px 4px; border-radius: 2px; border: 1px solid var(--grid-line); }

/* \u2500\u2500 Footer \u2500\u2500 */
.cmd-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 0;
  border-top: 1px solid var(--grid-line-strong);
  font-size: 0.68rem;
  color: var(--text-muted);
  letter-spacing: 0.03em;
}

.footer-marker { color: var(--accent); font-weight: 700; }
.footer-sep { opacity: 0.3; }
.footer-blink { color: var(--green); animation: blink-slow 3s ease-in-out infinite; }

@keyframes blink-slow {
  0%, 80%, 100% { opacity: 1; }
  90% { opacity: 0.3; }
}

/* \u2500\u2500 Animations \u2500\u2500 */
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes fadeInRow {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeInStep {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* \u2500\u2500 Responsive \u2500\u2500 */
@media (max-width: 700px) {
  .bento-health,
  .bento-sessions,
  .bento-tokens,
  .bento-cache,
  .bento-issues,
  .bento-donut,
  .bento-savings {
    grid-column: 1 / -1;
  }
}

@media (max-width: 900px) {
  .actions-grid { grid-template-columns: 1fr; }
  .findings-toolbar {
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 14px;
  }
  .filter-group {
    flex-wrap: wrap;
    gap: 4px;
  }
  .filter-select {
    width: 100%;
  }
  .findings-count {
    margin-left: 0;
  }
  .section-collapsible > summary {
    padding: 10px 14px;
    min-height: 44px;
  }
}

@media (max-width: 600px) {
  .report-container { padding: 0 12px 32px; }
  .cmd-header-top { flex-direction: column; gap: 12px; align-items: flex-start; }
  .cmd-nav { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .metric-val { font-size: 1.4rem; }
  .bar-row { grid-template-columns: 1fr; gap: 4px; }
  .bar-label { text-align: left; }
  .findings-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 10px 14px;
  }
  .filter-group {
    flex-wrap: wrap;
    gap: 6px;
  }
  .filter-chip-label {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 4px 16px;
  }
  .filter-select {
    width: 100%;
    min-height: 44px;
  }
  .clear-filters-btn {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .findings-count {
    text-align: center;
  }
  .section-collapsible > summary {
    min-height: 44px;
  }
}

/* \u2500\u2500 prefers-reduced-motion \u2500\u2500 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>`;
}
function renderScripts() {
  return `<script>
// \u2500\u2500 Theme toggle \u2500\u2500
function toggleTheme() {
  var html = document.documentElement;
  var current = html.getAttribute('data-theme');
  var next = current === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  try { localStorage.setItem('tokenomics-theme', next); } catch(e) {}
}

(function() {
  try {
    var saved = localStorage.getItem('tokenomics-theme');
    if (saved) { document.documentElement.setAttribute('data-theme', saved); }
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch(e) {}
})();

// \u2500\u2500 Sticky nav highlighting \u2500\u2500
(function() {
  var links = document.querySelectorAll('.cmd-nav-link');
  var sections = ['overview','findings','actions'].map(function(id) { return document.getElementById(id); }).filter(Boolean);

  function updateNav() {
    var current = '';
    for (var i = 0; i < sections.length; i++) {
      var rect = sections[i].getBoundingClientRect();
      if (rect.top <= 120) current = sections[i].id;
    }
    links.forEach(function(link) {
      link.classList.toggle('active', link.getAttribute('data-section') === current);
    });
  }

  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();
})();

// \u2500\u2500 JS-powered tooltips \u2500\u2500
(function() {
  var tip = document.createElement('div');
  tip.className = 'tooltip-popup';
  document.body.appendChild(tip);

  document.addEventListener('mouseover', function(e) {
    var el = e.target.closest('[data-tooltip]');
    if (!el) return;
    tip.textContent = el.getAttribute('data-tooltip');
    tip.classList.add('visible');

    var rect = el.getBoundingClientRect();
    var tipW = tip.offsetWidth;
    var tipH = tip.offsetHeight;
    var left = rect.left + rect.width / 2 - tipW / 2;
    var top = rect.top - tipH - 12;

    if (left < 8) left = 8;
    if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;
    if (top < 8) { top = rect.bottom + 12; }

    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  });

  document.addEventListener('mouseout', function(e) {
    var el = e.target.closest('[data-tooltip]');
    if (el) { tip.classList.remove('visible'); }
  });
})();

// \u2500\u2500 Bar fill animation on scroll \u2500\u2500
(function() {
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.bar-fill').forEach(function(bar) {
          var w = bar.style.width;
          bar.style.width = '0%';
          requestAnimationFrame(function() {
            requestAnimationFrame(function() { bar.style.width = w; });
          });
        });
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  document.querySelectorAll('.savings-bars').forEach(function(el) { observer.observe(el); });
})();

// \u2500\u2500 Filter toolbar logic \u2500\u2500
(function() {
  function applyFilters() {
    var checkboxes = document.querySelectorAll('.filter-chip input[type="checkbox"]');
    var activeSeverities = [];
    checkboxes.forEach(function(cb) {
      if (cb.checked) activeSeverities.push(cb.value);
    });

    var detectorSelect = document.getElementById('detector-filter');
    var selectedDetector = detectorSelect ? detectorSelect.value : '';

    var cards = document.querySelectorAll('.finding-card');
    var visibleCount = 0;
    var totalCount = cards.length;

    cards.forEach(function(card) {
      var sev = card.getAttribute('data-severity');
      var det = card.getAttribute('data-detector');
      var matchesSev = activeSeverities.indexOf(sev) !== -1;
      var matchesDet = !selectedDetector || det === selectedDetector;

      if (matchesSev && matchesDet) {
        card.classList.remove('finding-hidden');
        visibleCount++;
      } else {
        card.classList.add('finding-hidden');
      }
    });

    // Update count
    var countEl = document.getElementById('findings-count');
    if (countEl) countEl.textContent = visibleCount + ' of ' + totalCount + ' issues';

    // Show/hide empty state
    var emptyState = document.querySelector('.empty-state');
    if (emptyState) emptyState.style.display = visibleCount === 0 ? 'flex' : 'none';

    // Show/hide clear button
    var clearBtn = document.getElementById('clear-filters');
    var hasFilter = activeSeverities.length < checkboxes.length || selectedDetector;
    if (clearBtn) clearBtn.style.display = hasFilter ? 'inline-flex' : 'none';
  }

  // Listen to checkbox changes
  document.querySelectorAll('.filter-chip input[type="checkbox"]').forEach(function(cb) {
    cb.addEventListener('change', applyFilters);
  });

  // Listen to detector dropdown
  var detectorSelect = document.getElementById('detector-filter');
  if (detectorSelect) detectorSelect.addEventListener('change', applyFilters);

  // Clear filters button
  var clearBtn = document.getElementById('clear-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      document.querySelectorAll('.filter-chip input[type="checkbox"]').forEach(function(cb) {
        cb.checked = true;
      });
      if (detectorSelect) detectorSelect.value = '';
      applyFilters();
    });
  }
})();

// \u2500\u2500 Collapsible sections with localStorage persistence \u2500\u2500
(function() {
  var collapsibles = document.querySelectorAll('.section-collapsible');
  collapsibles.forEach(function(el) {
    var id = el.id;
    if (!id) return;

    // Restore saved state
    try {
      var saved = localStorage.getItem('tokenomics-collapsed-' + id);
      if (saved === 'closed') el.removeAttribute('open');
    } catch(e) {}

    el.addEventListener('toggle', function() {
      try {
        var key = 'tokenomics-collapsed-' + id;
        if (el.hasAttribute('open')) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, 'closed');
        }
      } catch(e) {}
    });
  });
})();
</script>`;
}
function renderHtmlReport(output) {
  const { metadata, findings } = output;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tokenomics Report &mdash; ${new Date(metadata.generatedAt).toLocaleDateString()}</title>
  ${renderStyles()}
</head>
<body>
  <div class="report-container">
    ${renderHeader(metadata)}
    ${renderDashboard(metadata, findings)}
    ${renderUnifiedFindings(findings)}
    ${renderFixSuggestions(findings)}
    ${renderFooter(metadata)}
  </div>
  ${renderScripts()}
</body>
</html>`;
}

// src/claude-config.ts
import { readFile as readFile3, writeFile, mkdir, stat as stat2 } from "fs/promises";
import { join as join5, dirname } from "path";
import { homedir as homedir3 } from "os";
var START_MARKER = "<!-- TOKENOMICS:START -->";
var END_MARKER = "<!-- TOKENOMICS:END -->";
function findClaudeMdFiles(projectDir) {
  const targets = [];
  targets.push({
    filePath: join5(homedir3(), ".claude", "CLAUDE.md"),
    existed: false,
    // will be determined at read time
    scope: "global"
  });
  if (projectDir) {
    targets.push({
      filePath: join5(projectDir, ".claude", "CLAUDE.md"),
      existed: false,
      scope: "project"
    });
  }
  return targets;
}
async function readClaudeMd(filePath) {
  try {
    return await readFile3(filePath, "utf-8");
  } catch {
    return "";
  }
}
async function writeClaudeMd(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}
async function fileExists(filePath) {
  try {
    const s = await stat2(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}
function extractManagedBlock(content) {
  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return { before: content, block: "", after: "" };
  }
  const before = content.slice(0, startIdx);
  const block = content.slice(startIdx + START_MARKER.length, endIdx);
  const after = content.slice(endIdx + END_MARKER.length);
  return { before, block, after };
}
function replaceManagedBlock(content, newBlock) {
  const { before, after } = extractManagedBlock(content);
  const managedSection = `${START_MARKER}
${newBlock}
${END_MARKER}`;
  if (before === content) {
    const separator = content.length > 0 && !content.endsWith("\n") ? "\n\n" : "\n";
    return content + separator + managedSection + "\n";
  }
  return before + managedSection + after;
}
async function readSettingsJson() {
  const settingsPath = join5(homedir3(), ".claude", "settings.json");
  try {
    const raw = await readFile3(settingsPath, "utf-8");
    return { path: settingsPath, content: JSON.parse(raw) };
  } catch {
    return null;
  }
}
async function writeSettingsJson(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(content, null, 2) + "\n", "utf-8");
}

// src/injector.ts
var CONFIDENCE_THRESHOLD = 0.3;
function findingsToInstructions(findings) {
  const instructions = [];
  for (const finding of findings) {
    if (finding.confidence < CONFIDENCE_THRESHOLD) continue;
    const block = detectorToInstruction(finding);
    if (block) {
      instructions.push(block);
    }
  }
  return instructions;
}
function detectorToInstruction(finding) {
  const evidence = finding.evidence;
  switch (finding.detector) {
    case "context-snowball": {
      const avgTurn = Math.round(evidence.avgInflectionTurn ?? 8);
      const rate = Math.round(evidence.snowballRate ?? 0);
      return {
        category: "behavioral-coaching",
        instruction: `Your context snowballs at **turn ${avgTurn}** on average (${rate}% of sessions). Use \`/compact\` proactively after turn ${Math.max(avgTurn - 2, 4)}-${avgTurn} on long sessions to prevent unbounded growth.`,
        sourceDetector: "context-snowball",
        confidence: finding.confidence
      };
    }
    case "model-selection": {
      const overkillRate = Math.round(evidence.overkillRate ?? 0);
      return {
        category: "model-recommendation",
        instruction: `You use Opus/Claude for **${overkillRate}%** of simple tasks. Prefer **Sonnet** for editing, small fixes, and exploration tasks to reduce token usage by ~5x on those sessions.`,
        sourceDetector: "model-selection",
        confidence: finding.confidence
      };
    }
    case "vague-prompts": {
      const vagueRate = Math.round(evidence.vagueRate ?? 0);
      return {
        category: "prompt-improvement",
        instruction: `**${vagueRate}%** of your prompts are under 10 words. Include specific file paths, function names, and expected outcomes to reduce clarification rounds.`,
        sourceDetector: "vague-prompts",
        confidence: finding.confidence
      };
    }
    case "bash-output-bloat": {
      return {
        category: "behavioral-coaching",
        instruction: `You receive verbose command output. Prefer \`Grep\`/\`Read\` tools over bash commands when searching files to reduce output tokens.`,
        sourceDetector: "bash-output-bloat",
        confidence: finding.confidence
      };
    }
    case "file-read-waste": {
      const wasteRate = finding.savingsPercent;
      return {
        category: "behavioral-coaching",
        instruction: `You read files you don't end up using. Use \`Grep\` first to locate relevant files before reading them \u2014 reduces unnecessary context by ~${wasteRate}%.`,
        sourceDetector: "file-read-waste",
        confidence: finding.confidence
      };
    }
    case "mcp-tool-tax": {
      const neverUsed = evidence.neverUsedServers ?? [];
      if (neverUsed.length === 0) return null;
      return {
        category: "model-recommendation",
        instruction: `MCP server(s) **${neverUsed.join(", ")}** are loaded but never used. Consider removing them to reduce per-session overhead.`,
        sourceDetector: "mcp-tool-tax",
        confidence: finding.confidence
      };
    }
    case "subagent-opportunity": {
      return {
        category: "behavioral-coaching",
        instruction: `You could benefit from subagents for parallel tasks. Consider splitting multi-file operations into parallel agent tasks.`,
        sourceDetector: "subagent-opportunity",
        confidence: finding.confidence
      };
    }
    case "session-timing": {
      return {
        category: "behavioral-coaching",
        instruction: `Some sessions use significantly more tokens than others. Consider shorter, more focused sessions with clear goals.`,
        sourceDetector: "session-timing",
        confidence: finding.confidence
      };
    }
    case "claude-md-overhead": {
      const size = finding.savingsPercent;
      if (size <= 0) return null;
      return {
        category: "behavioral-coaching",
        instruction: `CLAUDE.md instructions may be adding overhead (~${size}% of session tokens). Keep instructions concise and remove redundant entries.`,
        sourceDetector: "claude-md-overhead",
        confidence: finding.confidence
      };
    }
    case "smart-router": {
      const simpleRate = Math.round(evidence.simpleSessionRate ?? 0);
      return {
        category: "model-routing",
        instruction: `**${simpleRate}%** of your sessions are simple tasks. Default to **Sonnet** for routine work, switch to Opus only for complex reasoning tasks.`,
        sourceDetector: "smart-router",
        confidence: finding.confidence
      };
    }
    default:
      return null;
  }
}
function renderInstructionBlock(instructions) {
  if (instructions.length === 0) {
    return "No optimization opportunities detected.";
  }
  const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const lines = [];
  lines.push(`## Token Optimization Insights`);
  lines.push("");
  lines.push(`_Last updated: ${now}_`);
  lines.push("");
  const groups = /* @__PURE__ */ new Map();
  for (const inst of instructions) {
    const existing = groups.get(inst.category) ?? [];
    existing.push(inst);
    groups.set(inst.category, existing);
  }
  const categoryTitles = {
    "model-recommendation": "### Model Usage",
    "model-routing": "### Model Routing",
    "behavioral-coaching": "### Context Management",
    "prompt-improvement": "### Prompt Quality",
    "budget-status": "### Budget Status",
    "general": "### General"
  };
  for (const [category, items] of groups) {
    const title = categoryTitles[category] ?? "### Other";
    lines.push(title);
    for (const item of items) {
      lines.push(`- ${item.instruction}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
async function injectFindings(findings, projectDir) {
  const instructions = findingsToInstructions(findings);
  if (instructions.length === 0 && findings.length === 0) {
    return {
      targets: [],
      instructionCount: 0,
      changed: false,
      instructions: []
    };
  }
  const renderedBlock = renderInstructionBlock(instructions);
  const targets = findClaudeMdFiles(projectDir);
  let changed = false;
  for (const target of targets) {
    const existed = await fileExists(target.filePath);
    target.existed = existed;
    const existingContent = await readClaudeMd(target.filePath);
    const newContent = replaceManagedBlock(existingContent, renderedBlock);
    if (newContent !== existingContent) {
      await writeClaudeMd(target.filePath, newContent);
      changed = true;
    }
  }
  return {
    targets,
    instructionCount: instructions.length,
    changed,
    instructions
  };
}

// src/hooks.ts
import { join as join6, dirname as dirname2 } from "path";
import { mkdir as mkdir2 } from "fs/promises";
var HOOK_COMMAND = "tokenomics --inject --quiet";
async function installHooks() {
  const settings = await readSettingsJson();
  const targetPath = settings?.path ?? join6(process.env.HOME ?? "", ".claude", "settings.json");
  await mkdir2(dirname2(targetPath), { recursive: true });
  const content = settings?.content ?? {};
  const hooks = content.hooks ?? {};
  const sessionStartHooks = hooks.SessionStart ?? [];
  const alreadyInstalled = sessionStartHooks.some(
    (entry) => {
      const entryHooks = entry.hooks;
      return Array.isArray(entryHooks) && entryHooks.some(
        (hook) => hook.command === HOOK_COMMAND
      );
    }
  );
  if (alreadyInstalled) {
    return { installed: false, path: targetPath };
  }
  const updatedHooks = {
    ...hooks,
    SessionStart: [
      ...sessionStartHooks,
      { matcher: "", hooks: [{ type: "command", command: HOOK_COMMAND }] }
    ]
  };
  const updatedContent = { ...content, hooks: updatedHooks };
  await writeSettingsJson(targetPath, updatedContent);
  return { installed: true, path: targetPath };
}

// src/optimizer.ts
function optimizeSettings(findings) {
  const changes = [];
  for (const finding of findings) {
    if (finding.confidence < 0.5) continue;
    if (finding.detector === "model-selection") {
      const evidence = finding.evidence;
      const rate = Math.round((evidence.overkillRate ?? 0) * 100);
      changes.push({
        type: "model-default",
        file: "~/.claude/settings.json",
        current: "(current model)",
        suggested: "claude-sonnet-4-6",
        reason: `Opus used for ${rate}% of simple tasks. Sonnet is ~5x more token-efficient for editing, small fixes, and exploration.`,
        confidence: finding.confidence
      });
    }
    if (finding.detector === "mcp-tool-tax") {
      const evidence = finding.evidence;
      const neverUsed = evidence.neverUsedServers ?? [];
      if (neverUsed.length > 0) {
        changes.push({
          type: "mcp-server-remove",
          file: "~/.claude/settings.json",
          current: neverUsed.join(", "),
          suggested: "(removed)",
          reason: `MCP servers [${neverUsed.join(", ")}] are loaded but never used. Removing reduces per-session overhead.`,
          confidence: finding.confidence
        });
      }
    }
  }
  return changes;
}
async function applySettings(changes, dryRun) {
  const results = [];
  for (const change of changes) {
    if (change.type === "model-default") {
      const applied = await applyModelDefault(change, dryRun);
      results.push(applied);
    } else if (change.type === "mcp-server-remove") {
      const applied = await applyMcpRemove(change, dryRun);
      results.push(applied);
    }
  }
  return results;
}
async function applyModelDefault(change, dryRun) {
  const settings = await readSettingsJson();
  if (!settings) {
    return { change, applied: false };
  }
  const currentModel = settings.content.model ?? "(not set)";
  if (currentModel.includes("sonnet") || currentModel.includes("haiku")) {
    return { change, applied: false };
  }
  if (!dryRun) {
    const updated = { ...settings.content, model: change.suggested };
    await writeSettingsJson(settings.path, updated);
  }
  return { change: { ...change, current: currentModel }, applied: !dryRun };
}
async function applyMcpRemove(change, dryRun) {
  const settings = await readSettingsJson();
  if (!settings) {
    return { change, applied: false };
  }
  if (!settings.content.mcpServers || typeof settings.content.mcpServers !== "object") {
    return { change, applied: false };
  }
  const servers = settings.content.mcpServers;
  const toRemove = change.current.split(", ").filter((name) => name in servers);
  if (toRemove.length === 0) {
    return { change, applied: false };
  }
  if (!dryRun) {
    const updated = { ...settings.content, mcpServers: { ...servers } };
    for (const name of toRemove) {
      delete updated.mcpServers[name];
    }
    await writeSettingsJson(settings.path, updated);
  }
  return { change, applied: !dryRun };
}

// src/budget.ts
import { open, readdir as readdir2, stat as stat4, readFile as readFile5, writeFile as writeFile3, mkdir as mkdir4 } from "fs/promises";
import { createReadStream as createReadStream2 } from "fs";
import { createInterface as createInterface2 } from "readline";
import { join as join8, dirname as dirname4 } from "path";
import { homedir as homedir5 } from "os";

// src/budget-config.ts
import { readFile as readFile4, writeFile as writeFile2, mkdir as mkdir3, stat as stat3 } from "fs/promises";
import { join as join7, dirname as dirname3 } from "path";
import { homedir as homedir4 } from "os";
function getConfigPath(customPath) {
  return customPath ?? join7(homedir4(), ".claude", "tokenomics.json");
}
var DEFAULT_BUDGET = {
  sessionCeiling: 5e5,
  dailyCeiling: 2e6,
  projectCeiling: 1e7,
  alertThresholds: [50, 80, 90],
  ceilingAction: "warn",
  muteAlerts: false
};
async function readBudgetConfig(customPath) {
  const configPath = getConfigPath(customPath);
  try {
    const raw = await readFile4(configPath, "utf-8");
    const content = JSON.parse(raw);
    return {
      sessionCeiling: content.sessionCeiling ?? DEFAULT_BUDGET.sessionCeiling,
      dailyCeiling: content.dailyCeiling ?? DEFAULT_BUDGET.dailyCeiling,
      projectCeiling: content.projectCeiling ?? DEFAULT_BUDGET.projectCeiling,
      alertThresholds: content.alertThresholds ?? DEFAULT_BUDGET.alertThresholds,
      ceilingAction: content.ceilingAction ?? DEFAULT_BUDGET.ceilingAction,
      muteAlerts: content.muteAlerts ?? DEFAULT_BUDGET.muteAlerts
    };
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}
async function writeBudgetConfig(config, customPath) {
  const configPath = getConfigPath(customPath);
  await mkdir3(dirname3(configPath), { recursive: true });
  await writeFile2(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
async function ensureBudgetConfig(customPath) {
  const configPath = getConfigPath(customPath);
  try {
    await stat3(configPath);
    const config = await readBudgetConfig(customPath);
    return { created: false, config };
  } catch {
    await writeBudgetConfig(DEFAULT_BUDGET, customPath);
    return { created: true, config: { ...DEFAULT_BUDGET } };
  }
}

// src/budget.ts
function getFiredAlertsPath() {
  return join8(homedir5(), ".claude", "tokenomics-alerts.json");
}
async function readFiredAlerts() {
  try {
    const raw = await readFile5(getFiredAlertsPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
async function writeFiredAlerts(fired) {
  const path = getFiredAlertsPath();
  await mkdir4(dirname4(path), { recursive: true });
  await writeFile3(path, JSON.stringify(fired, null, 2) + "\n", "utf-8");
}
function alertKey(scope, threshold) {
  return `${scope}:${threshold}`;
}
async function findActiveSessionJsonl(claudeDir) {
  const dirs = claudeDir ? [claudeDir] : await detectClaudeDirs();
  for (const dir of dirs) {
    const projectsDir = join8(dir, "projects");
    try {
      const projects = await readdir2(projectsDir);
      for (const project of projects) {
        const projectPath = join8(projectsDir, project);
        try {
          const entries = await readdir2(projectPath, { withFileTypes: true });
          const jsonlFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".jsonl")).map((e) => join8(projectPath, e.name));
          if (jsonlFiles.length === 0) continue;
          const filesWithTime = await Promise.all(
            jsonlFiles.map(async (path) => ({
              path,
              mtime: (await stat4(path)).mtime.getTime()
            }))
          );
          filesWithTime.sort((a, b) => b.mtime - a.mtime);
          return filesWithTime[0].path;
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}
function sumTokensFromLines(lines) {
  let total = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.type === "assistant" && record.message) {
        const message = record.message;
        const usage = message.usage;
        if (usage) {
          total += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
        }
      }
    } catch {
      continue;
    }
  }
  return total;
}
async function sumTokensFromStream(filePath) {
  let total = 0;
  const rl = createInterface2({
    input: createReadStream2(filePath, "utf-8"),
    crlfDelay: Infinity
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.type === "assistant" && record.message) {
        const message = record.message;
        const usage = message.usage;
        if (usage) {
          total += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
        }
      }
    } catch {
      continue;
    }
  }
  return total;
}
async function getActiveSessionTokens(claudeDir) {
  const jsonlPath = await findActiveSessionJsonl(claudeDir);
  if (!jsonlPath) return 0;
  try {
    const fileStat = await stat4(jsonlPath);
    const fileSize = fileStat.size;
    const TAIL_BYTES = 8192;
    const readStart = Math.max(0, fileSize - TAIL_BYTES);
    const readLength = fileSize - readStart;
    let content;
    if (readStart > 0) {
      const handle = await open(jsonlPath, "r");
      try {
        const buffer = Buffer.alloc(readLength);
        await handle.read(buffer, 0, readLength, readStart);
        content = buffer.toString("utf-8");
      } finally {
        await handle.close();
      }
      const firstNewline = content.indexOf("\n");
      if (firstNewline !== -1) {
        content = content.slice(firstNewline + 1);
      }
    } else {
      content = await readFile5(jsonlPath, "utf-8");
    }
    return sumTokensFromLines(content.trim().split("\n"));
  } catch {
    return 0;
  }
}
function getBudgetCachePath() {
  return join8(homedir5(), ".claude", "tokenomics-budget-cache.json");
}
async function readBudgetCache() {
  try {
    const raw = await readFile5(getBudgetCachePath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function writeBudgetCache(cache) {
  const path = getBudgetCachePath();
  await mkdir4(dirname4(path), { recursive: true });
  await writeFile3(path, JSON.stringify(cache, null, 2) + "\n", "utf-8");
}
async function getDailyTokens(claudeDir) {
  const files = await discoverFiles({ days: 1, ...claudeDir ? { claudeDir } : {} });
  let total = 0;
  const BATCH = 20;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((f) => sumTokensFromStream(f.path)));
    total += results.reduce((sum, n) => sum + n, 0);
  }
  return total;
}
async function getProjectTokens(claudeDir) {
  const files = await discoverFiles({ days: 30, ...claudeDir ? { claudeDir } : {} });
  let total = 0;
  const BATCH = 20;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((f) => sumTokensFromStream(f.path)));
    total += results.reduce((sum, n) => sum + n, 0);
  }
  return total;
}
async function refreshBudgetCache(claudeDir) {
  const [daily, project] = await Promise.all([
    getDailyTokens(claudeDir),
    getProjectTokens(claudeDir)
  ]);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const cache = {
    daily: { tokens: daily, updatedAt: now },
    project: { tokens: project, updatedAt: now }
  };
  await writeBudgetCache(cache);
  return cache;
}
function createBudgetState(scope, used, ceiling, project) {
  return {
    scope,
    used,
    ceiling,
    percent: ceiling > 0 ? Math.min(100, used / ceiling * 100) : 0,
    project
  };
}
async function checkBudget(configOrOptions, claudeDir) {
  let budgetConfig;
  let dir;
  let forceRefresh = false;
  if (configOrOptions && typeof configOrOptions === "object" && "forceRefresh" in configOrOptions) {
    const opts = configOrOptions;
    budgetConfig = opts.config ?? await readBudgetConfig();
    dir = opts.claudeDir ?? claudeDir;
    forceRefresh = opts.forceRefresh ?? false;
  } else {
    budgetConfig = configOrOptions ?? await readBudgetConfig();
    dir = claudeDir;
  }
  const sessionTokens = await getActiveSessionTokens(dir);
  let dailyTokens;
  let projectTokens;
  const cachedScopes = /* @__PURE__ */ new Set();
  if (forceRefresh) {
    const cache = await refreshBudgetCache(dir);
    dailyTokens = cache.daily.tokens;
    projectTokens = cache.project.tokens;
  } else {
    const cache = await readBudgetCache();
    if (cache) {
      dailyTokens = cache.daily.tokens;
      projectTokens = cache.project.tokens;
      cachedScopes.add("daily").add("project");
    } else {
      dailyTokens = sessionTokens;
      projectTokens = sessionTokens;
      cachedScopes.add("daily").add("project");
    }
  }
  const states = [
    createBudgetState("session", sessionTokens, budgetConfig.sessionCeiling),
    createBudgetState("daily", dailyTokens, budgetConfig.dailyCeiling),
    createBudgetState("project", projectTokens, budgetConfig.projectCeiling)
  ];
  const firedAlerts = await readFiredAlerts();
  const newAlerts = [];
  let ceilingExceeded = false;
  let exceededScope;
  for (const state of states) {
    if (state.percent >= 100) {
      ceilingExceeded = true;
      exceededScope = state.scope;
    }
    if (budgetConfig.muteAlerts) continue;
    for (const threshold of budgetConfig.alertThresholds) {
      const key = alertKey(state.scope, threshold);
      if (state.percent >= threshold && !firedAlerts[key]) {
        firedAlerts[key] = (/* @__PURE__ */ new Date()).toISOString();
        newAlerts.push({
          scope: state.scope,
          threshold,
          timestamp: firedAlerts[key],
          project: state.project
        });
      }
    }
  }
  if (newAlerts.length > 0) {
    await writeFiredAlerts(firedAlerts);
  }
  return {
    states,
    newAlerts,
    ceilingExceeded,
    exceededScope,
    cachedScopes
  };
}
function renderBudgetDashboard(states, _config, cachedScopes) {
  const lines = [];
  lines.push("Token Budget Status");
  lines.push("=".repeat(50));
  lines.push("");
  for (const state of states) {
    const percentage = Math.round(state.percent);
    const filled = Math.round(percentage / 2);
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(50 - filled);
    const emoji = percentage >= 90 ? "\u{1F534}" : percentage >= 75 ? "\u{1F7E1}" : "\u{1F7E2}";
    const cached = cachedScopes?.has(state.scope) ? " (cached)" : "";
    lines.push(`${emoji} ${state.scope.toUpperCase()}: ${percentage}%${cached}`);
    lines.push(`  ${bar}`);
    lines.push(`  ${state.used.toLocaleString()} / ${state.ceiling.toLocaleString()} tokens`);
    lines.push("");
  }
  if (cachedScopes && cachedScopes.size > 0) {
    lines.push("Run `tokenomics --budget` to refresh daily/project totals.");
  }
  return lines.join("\n");
}
function renderBudgetCheckOutput(result) {
  const lines = [];
  if (result.ceilingExceeded) {
    lines.push(`\u26A0\uFE0F  Budget ceiling exceeded: ${result.exceededScope}`);
  }
  if (result.newAlerts.length > 0) {
    for (const alert of result.newAlerts) {
      lines.push(`\u26A0\uFE0F  ${alert.scope} threshold: ${alert.threshold}%`);
    }
  }
  if (lines.length === 0) {
    lines.push("\u2705 All budgets within limits");
  }
  return lines.join("\n");
}

// src/auditor.ts
var DEFAULT_MAX_CODE_BLOCK_LINES = 30;
var DEFAULT_MAX_STACK_FRAMES = 15;
var BUILT_IN_RULES = [
  {
    id: "redundant-file-paste",
    title: "Redundant File Paste",
    severity: "warning",
    check: (prompt) => {
      const codeBlockMatch = prompt.match(/```[\s\S]*?```/g);
      if (!codeBlockMatch) return null;
      for (const block of codeBlockMatch) {
        const lines = block.split("\n").length;
        if (lines > DEFAULT_MAX_CODE_BLOCK_LINES) {
          return {
            ruleId: "redundant-file-paste",
            title: "Redundant File Paste",
            severity: "warning",
            description: `Code block is ${lines} lines. Large pastes waste tokens.`,
            suggestion: "Reference the file path instead. Claude can read files directly using the Read tool.",
            estimatedSavings: (lines - DEFAULT_MAX_CODE_BLOCK_LINES) * 20
            // ~20 tokens per line
          };
        }
      }
      return null;
    }
  },
  {
    id: "verbose-error-log",
    title: "Verbose Error Log",
    severity: "info",
    check: (prompt) => {
      const stackTraceMatch = prompt.match(/at\s+\w+\s+\(.+?\)/g);
      if (!stackTraceMatch) return null;
      const frameCount = stackTraceMatch.length;
      if (frameCount > DEFAULT_MAX_STACK_FRAMES) {
        return {
          ruleId: "verbose-error-log",
          title: "Verbose Error Log",
          severity: "info",
          description: `Stack trace has ${frameCount} frames. Most are unnecessary.`,
          suggestion: `Trim to first 10 + last 5 frames. Only the entry point and error location matter.`,
          estimatedSavings: (frameCount - DEFAULT_MAX_STACK_FRAMES) * 15
        };
      }
      return null;
    }
  },
  {
    id: "no-specificity",
    title: "Low Specificity Prompt",
    severity: "info",
    check: (prompt) => {
      const words = prompt.trim().split(/\s+/).filter((w) => w.length > 0);
      const wordCount = words.length;
      const hasFileRef = /[\w\-./]+\.(ts|js|py|go|rs|java)/.test(prompt);
      const hasFunctionRef = /[\w]+\(\)/.test(prompt);
      if (wordCount < 10 && !hasFileRef && !hasFunctionRef) {
        return {
          ruleId: "no-specificity",
          title: "Low Specificity Prompt",
          severity: "info",
          description: `Prompt is only ${wordCount} words with no file or function references.`,
          suggestion: "Add specific file paths, function names, and expected outcomes to reduce clarification rounds.",
          estimatedSavings: 200
          // Estimated back-and-forth savings
        };
      }
      return null;
    }
  },
  {
    id: "over-scoped-request",
    title: "Over-Scoped Request",
    severity: "warning",
    check: (prompt) => {
      const overScopedPatterns = [
        /fix\s+all/gi,
        /refactor\s+everything/gi,
        /update\s+the\s+whole/gi,
        /change\s+all\s+the/gi
      ];
      for (const pattern of overScopedPatterns) {
        if (pattern.test(prompt)) {
          return {
            ruleId: "over-scoped-request",
            title: "Over-Scoped Request",
            severity: "warning",
            description: "Prompt asks for broad changes across many files.",
            suggestion: "Scope the work to specific files or modules. Break into smaller, focused tasks.",
            estimatedSavings: 500
            // Large scoping creates long responses
          };
        }
      }
      return null;
    }
  },
  {
    id: "duplicate-context",
    title: "Duplicate Context",
    severity: "info",
    check: (prompt) => {
      const sentences = prompt.split(/[.!?]+/).filter((s) => s.trim().length > 10);
      const uniqueSentences = new Set(sentences.map((s) => s.trim().toLowerCase()));
      if (sentences.length > uniqueSentences.size) {
        const duplicateCount = sentences.length - uniqueSentences.size;
        return {
          ruleId: "duplicate-context",
          title: "Duplicate Context",
          severity: "info",
          description: `${duplicateCount} sentences are duplicates or near-duplicates.`,
          suggestion: "Remove redundant context. Each point should be stated once.",
          estimatedSavings: duplicateCount * 50
        };
      }
      return null;
    }
  }
];
function auditPrompt(prompt, _context) {
  const findings = [];
  for (const rule of BUILT_IN_RULES) {
    try {
      const finding = rule.check(prompt);
      if (finding) {
        findings.push(finding);
      }
    } catch {
      continue;
    }
  }
  const grade = calculateGrade2(findings);
  const severityCounts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length
  };
  const totalEstimatedSavings = findings.reduce((sum, f) => sum + f.estimatedSavings, 0);
  return {
    grade,
    findings,
    totalEstimatedSavings,
    severityCounts
  };
}
function calculateGrade2(findings) {
  const hasCritical = findings.some((f) => f.severity === "critical");
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const infoCount = findings.filter((f) => f.severity === "info").length;
  if (hasCritical) return "D";
  if (warningCount >= 2) return "C";
  if (warningCount >= 1 || infoCount >= 2) return "B";
  return "A";
}

// src/prompt-output.ts
function renderPromptOutput(decision, report) {
  const lines = [];
  const modelShort = decision.model.replace("claude-", "").replace("-4-6", "").replace("-4-20250514", "");
  const confidence = `${(decision.confidence * 100).toFixed(0)}%`;
  lines.push(`Model:   ${modelShort} (${confidence}) \u2014 ${decision.reason.toLowerCase()}`);
  const gradeEmoji = report.grade === "A" ? "" : report.grade === "B" ? "" : report.grade === "C" ? "" : "";
  const gradeLabel = report.grade === "A" ? "clean prompt" : `${report.findings.length} finding${report.findings.length !== 1 ? "s" : ""}`;
  lines.push(`Grade:   ${gradeEmoji}${report.grade} \u2014 ${gradeLabel}`);
  if (decision.estimatedSavings.includes("80%")) {
    lines.push(`Savings: ~80% vs opus`);
  } else if (report.totalEstimatedSavings > 0) {
    lines.push(`Waste:   ~${report.totalEstimatedSavings.toLocaleString()} tokens`);
  }
  if (report.findings.length > 0) {
    lines.push("");
    for (const finding of report.findings) {
      const tag = `[${finding.severity}]`;
      lines.push(`  ${tag} ${finding.title} \u2014 ${finding.suggestion.split(".")[0]}`);
    }
  }
  return lines.join("\n");
}

// src/analyze.ts
var VERSION = "2.3.1";
function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      json: { type: "boolean", default: false },
      report: { type: "boolean", default: false },
      html: { type: "boolean", default: false },
      out: { type: "string" },
      days: { type: "string", default: "30" },
      project: { type: "string" },
      verbose: { type: "boolean", default: false },
      fix: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "claude-dir": { type: "string", multiple: true },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      inject: { type: "boolean", default: false },
      setup: { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
      prompt: { type: "string" },
      budget: { type: "boolean", default: false },
      "budget-check": { type: "boolean", default: false },
      "no-alerts": { type: "boolean", default: false },
      "analyze-skill": { type: "string" }
    },
    strict: true
  });
  if (values.version) {
    console.log(`tokenomics v${VERSION}`);
    process.exit(0);
  }
  return {
    json: values.json,
    report: values.report,
    html: values.html,
    out: values.out,
    days: parseInt(values.days, 10),
    project: values.project,
    verbose: values.verbose,
    help: values.help,
    fix: values.fix,
    dryRun: values["dry-run"],
    claudeDirs: values["claude-dir"] ?? [],
    inject: values.inject,
    setup: values.setup,
    quiet: values.quiet,
    prompt: values.prompt,
    budget: values.budget,
    budgetCheck: values["budget-check"],
    noAlerts: values["no-alerts"],
    analyzeSkill: values["analyze-skill"]
  };
}
function showHelp() {
  console.log(`
tokenomics \u2014 Token Intelligence for Claude Code

Analyzes your Claude Code session history to find token waste patterns
and provides actionable recommendations. Runs locally, no LLM needed.

Auto-detects all ~/.claude* installation directories.

USAGE
  tokenomics [options]

OUTPUT MODES
  (default)            Terminal summary table
  --report             Full markdown coaching report
  --html               Generate HTML report and open in browser
  --json               Machine-readable JSON (pipe to jq, scripts, etc.)
  --out <file>         Write JSON to file (prints file path)

ANALYSIS
  --days <N>           Analyze last N days (default: 30)
  --project <P>        Filter to specific project path
  --claude-dir <path>  Claude installation dir (default: auto-detect all)
                       Can be specified multiple times for custom selection

FIXES
  --fix                Apply auto-fixable optimizations
  --fix --dry-run      Preview fixes without writing files

INTEGRATION
  --setup              One-time setup: install hooks + initial injection
  --inject             Run analysis + inject findings into CLAUDE.md
  --quiet              Suppress output (used by SessionStart hooks)

PROMPT ANALYSIS
  --prompt <text>      Analyze a prompt: model recommendation + quality grade
  --budget             Show token budget dashboard
  --budget-check       Lightweight budget check (for hooks)
  --no-alerts          Suppress budget alerts (no CLAUDE.md injection)

SKILL ANALYSIS
  --analyze-skill <dir> Analyze skill package for token efficiency
                       Outputs JSON with findings and efficiency score

OTHER
  --verbose            Show discovery progress and debug info
  --help               Show this message
  --version            Show version

WHAT --fix DOES
  1. Sets default model to Sonnet (saves ~5x tokens on simple sessions)
     Edits: ~/.claude/settings.json (or equivalent)
  2. Removes never-used MCP servers (reduces overhead on every session)
     Edits: ~/.claude.json (or equivalent)

EXAMPLES
  tokenomics                        Quick terminal summary
  tokenomics --html                 Beautiful HTML dashboard
  tokenomics --json --days 7        Last week's data as JSON
  tokenomics --fix --dry-run        Preview auto-fixes
  tokenomics --fix                  Apply fixes
  tokenomics --claude-dir ~/.claude-zai   Analyze specific installation
  tokenomics --prompt "fix bug"     Analyze prompt (model + grade)
  tokenomics --budget               Show budget dashboard
  tokenomics --prompt "design a schema"  Check complex prompt
`);
}
function calculateMetadata(sessions) {
  if (sessions.length === 0) {
    return {
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      sessionCount: 0,
      dateRange: { start: "", end: "" },
      totalTokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 },
      version: VERSION
    };
  }
  const dates = sessions.flatMap((s) => [s.startedAt, s.endedAt]).filter(Boolean).sort();
  const totalTokens = sessions.reduce(
    (acc, s) => ({
      input: acc.input + s.totalInputTokens,
      output: acc.output + s.totalOutputTokens,
      cacheRead: acc.cacheRead + s.totalCacheReadTokens,
      cacheCreation: acc.cacheCreation + s.totalCacheCreationTokens
    }),
    { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
  );
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    sessionCount: sessions.length,
    dateRange: {
      start: dates[0] ?? "",
      end: dates[dates.length - 1] ?? ""
    },
    totalTokens: {
      ...totalTokens,
      total: totalTokens.input + totalTokens.output + totalTokens.cacheRead + totalTokens.cacheCreation
    },
    version: VERSION
  };
}
function buildManualActions(findings, includeFinding = false) {
  const actions = [];
  const autoFixable = /* @__PURE__ */ new Set(["model-selection", "mcp-tool-tax"]);
  for (const f of findings) {
    if (autoFixable.has(f.detector)) continue;
    const existing = actions.find((a) => a.detector === f.detector);
    if (existing) continue;
    actions.push({
      detector: f.detector,
      priority: f.severity,
      title: f.title,
      instruction: f.remediation.steps.map((s) => `${s.action}: ${s.howTo}`).join("\n"),
      sessionBreakdown: f.sessionBreakdown,
      ...includeFinding ? { finding: f } : {}
    });
  }
  return actions.sort((a, b) => {
    const prio = { high: 0, medium: 1, low: 2 };
    return prio[a.priority] - prio[b.priority];
  });
}
function renderFixOutput(output) {
  const tick = "\x1B[32m\x1B[1m\u2713\x1B[0m";
  const cross = "\x1B[33m\u23ED\x1B[0m";
  const bold = "\x1B[1m";
  const dim = "\x1B[2m";
  const reset = "\x1B[0m";
  const green = "\x1B[32m";
  const red = "\x1B[31m";
  const yellow = "\x1B[33m";
  const cyan = "\x1B[36m";
  console.log("");
  console.log(`${cyan}${bold}  TOKENOMICS FIX${reset}` + (output.dryRun ? ` ${yellow}(dry run \u2014 no changes written)${reset}` : ""));
  console.log(`${dim}  ${"\u2500".repeat(56)}${reset}`);
  console.log("");
  console.log(`${bold}  Step 1: Scanning your sessions...${reset}`);
  const totalFindings = output.applied.length + output.skipped.length + output.manual.length;
  console.log(`  Found ${totalFindings} optimization opportunit${totalFindings !== 1 ? "ies" : "y"} across your Claude Code sessions.`);
  console.log("");
  if (output.applied.length > 0) {
    console.log(`${bold}  Step 2: Applying auto-fixes...${reset}`);
    for (const fix of output.applied) {
      console.log("");
      console.log(`  ${tick} ${green}${fix.action}${reset}`);
      console.log(`     ${dim}File:${reset}   ${fix.file}`);
      console.log(`     ${dim}Before:${reset} ${fix.before}`);
      console.log(`     ${dim}After:${reset}  ${fix.after}`);
    }
  } else if (output.skipped.length > 0) {
    console.log(`${bold}  Step 2: Checking for auto-fixes...${reset}`);
    console.log(`  ${cross} No auto-fixes applicable right now.`);
  }
  if (output.skipped.length > 0) {
    console.log("");
    console.log(`${bold}  Skipped:${reset}`);
    for (const s of output.skipped) {
      console.log(`  ${cross} ${s.detector}: ${s.reason}`);
    }
  }
  if (output.manual.length > 0) {
    console.log("");
    console.log(`${"\u2500".repeat(58)}`);
    console.log(`${bold}  Step 3: Actions that need your manual attention${reset}`);
    console.log(`${dim}  These are habits, not settings \u2014 no script can automate them.${reset}`);
    console.log("");
    for (const action of output.manual) {
      const badge = action.priority === "high" ? `${red}${bold}HIGH${reset}` : action.priority === "medium" ? `${yellow}MED ${reset}` : `${cyan}LOW ${reset}`;
      console.log(`  [${badge}] ${bold}${action.title}${reset}`);
      const lines = action.instruction.split("\n");
      for (const line of lines) {
        console.log(`    ${line}`);
      }
      if (action.sessionBreakdown && action.sessionBreakdown !== "_No specific sessions to call out._") {
        console.log(`${dim}    Affected sessions:${reset}`);
        const breakdown = action.sessionBreakdown.split("\n");
        for (const line of breakdown) {
          console.log(`    ${dim}${line}${reset}`);
        }
      }
      console.log("");
    }
  }
  console.log(`${dim}  ${"\u2500".repeat(56)}${reset}`);
  const totalApplied = output.applied.length;
  if (totalApplied > 0) {
    console.log(`${green}${bold}  Done:${reset} ${totalApplied} fix${totalApplied !== 1 ? "es" : ""} applied.`);
  } else {
    console.log(`  Done: No auto-fixes were needed.`);
  }
  if (output.manual.length > 0) {
    console.log(`  ${yellow}${output.manual.length} manual action${output.manual.length !== 1 ? "s" : ""} still needed${reset} \u2014 see above.`);
  }
  console.log("");
}
function fmt3(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}
function renderTerminalSummary(output) {
  const { metadata, findings } = output;
  const days = Math.round(
    (new Date(metadata.dateRange.end).getTime() - new Date(metadata.dateRange.start).getTime()) / 864e5
  ) || 30;
  console.log("");
  console.log("\x1B[1m\x1B[36m  TOKENOMICS \u2014 Token Intelligence for Claude Code\x1B[0m");
  console.log(`\x1B[2m  ${metadata.sessionCount} sessions // ${days} day range // v${VERSION}\x1B[0m`);
  console.log("");
  const cacheHitRate = metadata.totalTokens.total > 0 ? (metadata.totalTokens.cacheRead / metadata.totalTokens.total * 100).toFixed(1) : "0";
  console.log(`  Sessions:   ${metadata.sessionCount}`);
  console.log(`  Total:     ${fmt3(metadata.totalTokens.total)} tokens`);
  console.log(`  Cache Hit: ${cacheHitRate}%`);
  console.log(`  Issues:    ${findings.length}`);
  console.log("");
  if (findings.length === 0) {
    console.log("\x1B[32m  No significant patterns detected. Your usage looks efficient.\x1B[0m");
    console.log("");
    return;
  }
  const totalSavings = findings.reduce((s, f) => s + f.savingsPercent, 0);
  console.log("\x1B[1m  Findings:\x1B[0m");
  for (const f of findings) {
    const block = extractHumanReadableBlock(f);
    console.log(renderTerminalBlock(block, f.severity));
  }
  console.log(`  \x1B[32mCombined potential: ~${totalSavings}% token reduction\x1B[0m`);
  const top3 = findings.slice(0, 3);
  if (top3.length > 0) {
    console.log("\n\x1B[1m  Quick Wins:\x1B[0m");
    top3.forEach((f, i) => {
      const qw = f.remediation.specificQuickWin.split("\n")[0].slice(0, 100);
      console.log(`  ${i + 1}. ${f.title}: ${qw}`);
    });
  }
  const hasAutoFix = findings.some((f) => f.detector === "model-selection" || f.detector === "mcp-tool-tax");
  if (hasAutoFix) {
    console.log("\n  \x1B[32m\x1B[1m  >>> Run \x1B[4mtokenomics --fix\x1B[24m to auto-fix some issues right now <<<\x1B[0m");
    console.log("  \x1B[2m  Use --fix --dry-run to preview first\x1B[0m");
  }
  console.log("\n  Run \x1B[1mtokenomics --html\x1B[0m for the full interactive dashboard");
  console.log("  Run \x1B[1mtokenomics --report\x1B[0m for the full markdown report");
  console.log("");
}
function renderMarkdownReport(output) {
  const { metadata, findings } = output;
  const days = Math.round(
    (new Date(metadata.dateRange.end).getTime() - new Date(metadata.dateRange.start).getTime()) / 864e5
  ) || 30;
  const lines = [];
  lines.push(`## Token Usage Analysis (${days} days)
`);
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Sessions | ${metadata.sessionCount} |`);
  lines.push(`| Total Tokens | ${fmt3(metadata.totalTokens.total)} |`);
  lines.push(`| Cache Read | ${fmt3(metadata.totalTokens.cacheRead)} |`);
  lines.push(`| Input | ${fmt3(metadata.totalTokens.input)} |`);
  lines.push(`| Output | ${fmt3(metadata.totalTokens.output)} |`);
  lines.push("");
  if (findings.length > 0) {
    const top = findings[0];
    lines.push(
      `The biggest opportunity is **${top.title}** \u2014 fixing it could save ~${top.savingsPercent}% of total tokens (~${fmt3(top.savingsTokens)} tokens).`
    );
  } else {
    lines.push("No significant token-wasting patterns detected.");
  }
  lines.push("");
  lines.push("---");
  findings.forEach((f, i) => {
    lines.push(
      `
## ${i + 1}. ${f.title} \u2014 ${f.savingsPercent}% savings (${fmt3(f.savingsTokens)} tokens, ${Math.round(f.confidence * 100)}% confidence)
`
    );
    lines.push("**What's happening:**");
    lines.push(f.remediation.problem);
    lines.push("");
    lines.push("**Why this matters:**");
    lines.push(f.remediation.whyItMatters);
    lines.push("");
    lines.push("**How to fix it:**");
    for (const step of f.remediation.steps) {
      lines.push(`\u2192 ${step.action}`);
      lines.push(`   How: ${step.howTo}`);
      lines.push(`   Impact: ${step.impact}`);
      lines.push("");
    }
    if (f.remediation.examples.length > 0) {
      for (const ex of f.remediation.examples) {
        lines.push(`  Before: ${ex.before}`);
        lines.push(`  After:  ${ex.after}`);
      }
      lines.push("");
    }
    lines.push(`**Quick win (${f.remediation.effort} effort):**`);
    lines.push(f.remediation.specificQuickWin);
    lines.push("");
    lines.push("---");
  });
  return lines.join("\n");
}
async function main() {
  const options = parseCliArgs();
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  if (options.noAlerts && !options.budget && !options.budgetCheck) {
    console.error("Note: --no-alerts only works with --budget or --budget-check.");
    console.error("Example: tokenomics --budget --no-alerts");
    process.exit(1);
  }
  if (options.prompt) {
    const signals = extractSignals(options.prompt);
    const decision = routePrompt(signals);
    const report = auditPrompt(options.prompt);
    console.log(renderPromptOutput(decision, report));
    return;
  }
  if (options.budget) {
    const config = await ensureBudgetConfig();
    const budgetConfig = { ...config.config, ...options.noAlerts && { muteAlerts: true } };
    const result = await checkBudget({ config: budgetConfig, forceRefresh: true });
    console.log(renderBudgetDashboard(result.states, budgetConfig, result.cachedScopes));
    return;
  }
  if (options.budgetCheck) {
    const config = await readBudgetConfig();
    const budgetConfig = { ...config, ...options.noAlerts && { muteAlerts: true } };
    const result = await checkBudget({ config: budgetConfig, forceRefresh: false });
    console.log(renderBudgetCheckOutput(result));
    process.exit(result.ceilingExceeded ? 1 : 0);
  }
  if (options.analyzeSkill) {
    const result = analyzeSkill(options.analyzeSkill);
    if (options.json) {
      console.log(JSON.stringify(result, null, options.verbose ? 2 : 0));
    } else {
      console.log(renderSkillReport(result));
    }
    return;
  }
  const discoveryOpts = {
    days: options.days,
    project: options.project
  };
  if (options.claudeDirs.length > 0) {
    discoveryOpts.claudeDir = options.claudeDirs[0];
  }
  const files = await discoverFiles(discoveryOpts);
  if (options.verbose) {
    logDiscoverySummary(files, true);
  }
  const sessions = await parseSessionFiles(files);
  if (options.verbose) {
    console.error(`Parsed ${sessions.length} sessions`);
  }
  const metadata = calculateMetadata(sessions);
  let findings = runAllDetectors(sessions);
  const asyncFindings = await runAsyncDetectors(sessions);
  findings = [...findings, ...asyncFindings];
  findings.sort((a, b) => b.savingsTokens - a.savingsTokens);
  if (options.verbose) {
    console.error(`Found ${findings.length} patterns`);
  }
  if (options.setup) {
    const projectDir = process.cwd();
    const hookResult = await installHooks();
    const budgetConfigResult = await ensureBudgetConfig();
    const injectResult = await injectFindings(findings, projectDir);
    if (!options.quiet) {
      console.log("");
      console.log("\x1B[1m\x1B[36m  TOKENOMICS SETUP\x1B[0m");
      console.log("\x1B[2m  " + "\u2500".repeat(56) + "\x1B[0m");
      console.log("");
      console.log(`  Hook:      ${hookResult.installed ? "Installed" : "Already installed"}`);
      console.log(`  Settings:  ${hookResult.path}`);
      console.log(`  Budget:    ${budgetConfigResult.created ? "Created" : "Exists"} (~/.claude/tokenomics.json)`);
      console.log(`  Injected:  ${injectResult.instructionCount} instructions into ${injectResult.targets.length} CLAUDE.md file(s)`);
      for (const target of injectResult.targets) {
        const status = target.existed ? "Updated" : "Created";
        console.log(`    ${status}: ${target.filePath}`);
      }
      console.log("");
      console.log("  \x1B[32mSetup complete.\x1B[0m Findings will auto-inject on every new Claude Code session.");
      console.log("");
    }
    return;
  }
  if (options.inject) {
    const projectDir = process.cwd();
    const result = await injectFindings(findings, projectDir);
    if (!options.quiet) {
      if (result.changed) {
        console.log(`Injected ${result.instructionCount} instructions into ${result.targets.length} CLAUDE.md file(s)`);
      } else {
        console.log("No changes needed \u2014 findings unchanged since last injection");
      }
    }
    return;
  }
  if (options.fix) {
    const suggestedChanges = optimizeSettings(findings);
    const appliedChanges = await applySettings(suggestedChanges, !options.dryRun);
    const fixOutput = {
      dryRun: options.dryRun,
      applied: appliedChanges.filter((c) => c.applied).map((c) => ({
        detector: c.change.type === "model-default" ? "model-selection" : "mcp-tool-tax",
        action: c.change.type === "model-default" ? `Set default model to ${c.change.suggested}` : `Removed unused MCP server(s)`,
        file: c.change.file,
        before: c.change.current,
        after: c.change.suggested
      })),
      skipped: appliedChanges.filter((c) => !c.applied).map((c) => ({
        detector: c.change.type === "model-default" ? "model-selection" : "mcp-tool-tax",
        reason: c.change.type === "model-default" ? "Default model already sonnet/haiku, or settings file not found" : "No never-used servers found or config files not accessible"
      })),
      manual: []
    };
    fixOutput.manual = buildManualActions(findings);
    if (options.json) {
      const { manual, ...jsonOutput } = fixOutput;
      console.log(JSON.stringify({ ...jsonOutput, manual: manual.map(({ finding, ...rest }) => rest) }, null, 2));
    } else {
      renderFixOutput(fixOutput);
    }
    if (!options.dryRun) {
      const injectResult = await injectFindings(findings, process.cwd());
      if (!options.quiet && injectResult.changed) {
        console.log(`
  Injected ${injectResult.instructionCount} insights into CLAUDE.md`);
      }
    }
    return;
  }
  findings = findings.filter((f) => f.savingsTokens > 0);
  const topSavings = findings[0]?.savingsTokens ?? 0;
  if (topSavings > 0) {
    for (const f of findings) {
      const abs = f.savingsPercent;
      if (abs < 1) {
        f.severity = "low";
      } else if (abs >= 10) {
        f.severity = "high";
      } else {
        const share = f.savingsTokens / topSavings;
        if (share >= 0.5) f.severity = "high";
        else if (share >= 0.15) f.severity = "medium";
        else f.severity = "low";
      }
    }
  }
  const output = { metadata, findings };
  if (options.html) {
    const outDir = join9(homedir6(), ".tokenomics");
    mkdirSync(outDir, { recursive: true });
    const outFile = join9(outDir, "report.html");
    writeFileSync(outFile, renderHtmlReport(output), "utf-8");
    const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    execSync(`${openCmd} "${outFile}"`);
    console.log(`Report opened in browser: ${outFile}`);
  } else if (options.report) {
    console.log(renderMarkdownReport(output));
  } else if (options.json) {
    const json = JSON.stringify(output, null, options.verbose ? 2 : 0);
    if (options.out) {
      const { writeFile: writeFile4 } = await import("fs/promises");
      await writeFile4(options.out, json, "utf-8");
      console.log(options.out);
    } else {
      console.log(json);
    }
  } else {
    renderTerminalSummary(output);
  }
}
main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
//# sourceMappingURL=analyze.js.map