'use client';

import { useState } from 'react';
import { ExternalLink, FileCode, AlertTriangle, Lightbulb, Info } from 'lucide-react';

interface Finding {
  stage: string;
  severity: string;
  type: string;
  description: string;
  location: string | null;
  confidence: number | null;
  tool: string | null;
  evidence: string | null;
  corroborated?: boolean;
  corroborationCount?: number;
}

interface FindingsListProps {
  findings: Finding[];
}

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type SortOption = 'severity' | 'stage' | 'tool' | 'location';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// Remediation guidance for common finding types
const REMEDIATION_MAP: Record<string, { title: string; whatItMeans: string; howToFix: string; reference?: string }> = {
  shell_injection: {
    title: 'Shell Command Injection',
    whatItMeans: 'This code executes shell commands. If user input is not sanitized, attackers could inject malicious commands.',
    howToFix: 'Use subprocess.run() with a list of arguments (not shell=True). Sanitize all inputs rigorously.',
    reference: 'https://owasp.org/www-community/attacks/Command_Injection',
  },
  code_execution: {
    title: 'Dynamic Code Execution',
    whatItMeans: 'This code uses eval() or exec() which can execute arbitrary code. This is dangerous with untrusted input.',
    howToFix: 'Replace eval()/exec() with ast.literal_eval() for safe parsing, or implement a proper parser.',
    reference: 'https://owasp.org/www-community/attacks/Code_Injection',
  },
  insecure_deserialize: {
    title: 'Insecure Deserialization',
    whatItMeans: 'Pickle, marshal, or shelve can execute arbitrary code when loading malicious data.',
    howToFix: 'Use JSON for serialization. Never deserialize data from untrusted sources.',
    reference: 'https://owasp.org/www-community/vulnerabilities/Deserialization_of_untrusted_data',
  },
  obfuscation: {
    title: 'Code Obfuscation',
    whatItMeans: 'This code appears to be obfuscated (e.g., base64 decode + exec). This is a strong indicator of malicious intent.',
    howToFix: 'Remove all obfuscated code. All code should be readable and auditable.',
  },
  env_access: {
    title: 'Environment Variable Access',
    whatItMeans: 'This code reads environment variables, which could expose secrets or configuration.',
    howToFix: 'Document which environment variables are required. Consider using a secrets manager for sensitive values.',
  },
  network_access: {
    title: 'Network Request',
    whatItMeans: 'This code makes network requests, which could potentially exfiltrate data.',
    howToFix: 'Declare all endpoints in permissions.network.outbound. Only connect to documented, trusted endpoints.',
  },
  undeclared_network: {
    title: 'Undeclared Network Access',
    whatItMeans: 'Network requests are made but no network permission is declared in the manifest.',
    howToFix: 'Add to manifest: "permissions": { "network": { "outbound": ["example.com"] } }',
  },
  undeclared_subprocess: {
    title: 'Undeclared Subprocess',
    whatItMeans: 'Subprocesses are spawned but subprocess permission is not declared.',
    howToFix: 'Add to manifest: "permissions": { "subprocess": true }',
  },
  prompt_injection_pattern: {
    title: 'Potential Prompt Injection',
    whatItMeans: 'Text contains patterns used in prompt injection attacks (e.g., "ignore previous instructions").',
    howToFix: 'Remove any text attempting to manipulate AI behavior. Ensure all instructions are legitimate documentation.',
    reference: 'https://owasp.org/www-project-top-10-for-large-language-model-applications/',
  },
  hidden_instruction: {
    title: 'Hidden Instruction',
    whatItMeans: 'An HTML/markdown comment contains instruction-like content that might influence AI behavior.',
    howToFix: 'Remove hidden instructions from comments. Comments should only contain documentation.',
  },
  base64_in_comment: {
    title: 'Base64 in Comment',
    whatItMeans: 'Base64-encoded content in comments could hide malicious instructions.',
    howToFix: 'Remove all base64 from comments. Code must be readable and auditable.',
  },
  elevated_suspicion: {
    title: 'Elevated Suspicion Score',
    whatItMeans: 'Multiple patterns associated with prompt injection were detected.',
    howToFix: 'Review content for text that could manipulate AI behavior. Simplify and clarify documentation.',
  },
  secret_found: {
    title: 'Secret Detected',
    whatItMeans: 'A potential secret (API key, password, token) was found in the code.',
    howToFix: 'Remove the secret immediately. Use environment variables or a secrets manager. Rotate the exposed credential.',
  },
  vulnerable_dependency: {
    title: 'Vulnerable Dependency',
    whatItMeans: 'A dependency has a known security vulnerability.',
    howToFix: 'Update the dependency to a patched version. Check OSV database for CVE details.',
    reference: 'https://osv.dev/',
  },
  js_pattern: {
    title: 'Dangerous JavaScript Pattern',
    whatItMeans: 'Code uses potentially dangerous JS patterns (eval, Function constructor, child_process).',
    howToFix: 'Replace eval()/new Function() with safer alternatives. Avoid shell execution.',
  },
  shell_pattern: {
    title: 'Dangerous Shell Pattern',
    whatItMeans: 'Shell script contains potentially dangerous commands (curl | bash, chmod 777, etc).',
    howToFix: 'Avoid curl | bash patterns. Use least-privileged permissions. Review all shell commands.',
  },
};

function getRemediation(findingType: string) {
  // Try exact match
  if (REMEDIATION_MAP[findingType]) {
    return REMEDIATION_MAP[findingType];
  }
  // Try partial match
  for (const [key, value] of Object.entries(REMEDIATION_MAP)) {
    if (findingType.includes(key) || key.includes(findingType)) {
      return value;
    }
  }
  // Bandit findings
  if (findingType.startsWith('bandit_')) {
    return {
      title: 'Security Issue (Bandit)',
      whatItMeans: 'A potential security vulnerability was detected by Bandit static analysis.',
      howToFix: 'Review the Bandit documentation for this specific check and apply the recommended fix.',
      reference: 'https://bandit.readthedocs.io/',
    };
  }
  return {
    title: 'Security Finding',
    whatItMeans: 'A potential security issue was detected by our scanning tools.',
    howToFix: 'Review the evidence and description. Address the issue before publishing, or document why it\'s a false positive.',
  };
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'border-l-red-500 bg-red-50';
    case 'high':
      return 'border-l-orange-500 bg-orange-50';
    case 'medium':
      return 'border-l-yellow-500 bg-yellow-50';
    case 'low':
      return 'border-l-blue-500 bg-blue-50';
    default:
      return 'border-l-gray-500 bg-gray-50';
  }
}

function getSeverityBadgeColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-600 text-white';
    case 'high':
      return 'bg-orange-500 text-white';
    case 'medium':
      return 'bg-yellow-500 text-white';
    case 'low':
      return 'bg-blue-500 text-white';
    default:
      return 'bg-gray-500 text-white';
  }
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return '🚨';
    case 'high':
      return '⚠️';
    case 'medium':
      return '⚡';
    case 'low':
      return 'ℹ️';
    default:
      return '•';
  }
}

// Expanded finding detail component
function ExpandedFinding({ finding }: { finding: Finding }) {
  const remediation = getRemediation(finding.type);

  return (
    <div className="px-4 py-4 border-t border-black/10 bg-white/50 space-y-4">
      {/* Location - Prominent display */}
      {finding.location && (
        <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-md">
          <FileCode className="w-4 h-4 text-slate-600 shrink-0" />
          <code className="text-sm font-mono text-slate-800 font-medium">
            {finding.location}
          </code>
        </div>
      )}

      {/* What this means */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-foreground">What this means</span>
        </div>
        <p className="text-sm text-muted-foreground pl-6">
          {remediation.whatItMeans}
        </p>
      </div>

      {/* Original description if different from remediation */}
      {finding.description && finding.description !== remediation.whatItMeans && (
        <div className="text-sm text-muted-foreground bg-slate-50 p-2 rounded">
          <span className="font-medium text-foreground">Details:</span> {finding.description}
        </div>
      )}

      {/* How to fix */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-foreground">How to fix</span>
        </div>
        <p className="text-sm text-muted-foreground pl-6">
          {remediation.howToFix}
        </p>
      </div>

      {/* Evidence */}
      {finding.evidence && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Code Evidence
          </div>
          <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded font-mono overflow-x-auto whitespace-pre-wrap">
            {finding.evidence}
          </pre>
        </div>
      )}

      {/* Tool Attribution & Confidence */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-slate-200">
        <div className="flex items-center gap-4">
          {finding.tool && (
            <span>
              Detected by: <span className="font-medium text-foreground">{finding.tool}</span>
            </span>
          )}
          {finding.stage && (
            <span>
              Stage: <span className="font-medium text-foreground">{finding.stage}</span>
            </span>
          )}
        </div>
        {finding.confidence !== null && finding.confidence !== undefined && (
          <div className="flex items-center gap-2">
            <span>Confidence:</span>
            <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${(finding.confidence || 0) * 100}%` }}
              />
            </div>
            <span className="font-medium">{Math.round((finding.confidence || 0) * 100)}%</span>
          </div>
        )}
      </div>

      {/* Reference Link */}
      {remediation.reference && (
        <div className="pt-2">
          <a
            href={remediation.reference}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            <Info className="w-3.5 h-3.5" />
            Learn more about this vulnerability
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}

export function FindingsList({ findings }: FindingsListProps) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('severity');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Filter findings
  const filteredFindings = findings.filter((f) => {
    if (severityFilter === 'all') return true;
    return f.severity === severityFilter;
  });

  // Sort findings
  const sortedFindings = [...filteredFindings].sort((a, b) => {
    switch (sortBy) {
      case 'severity':
        return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      case 'stage':
        return a.stage.localeCompare(b.stage);
      case 'tool':
        return (a.tool || '').localeCompare(b.tool || '');
      case 'location':
        return (a.location || '').localeCompare(b.location || '');
      default:
        return 0;
    }
  });

  // Count by severity
  const counts: Record<string, number> = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
  };

  if (findings.length === 0) {
    return (
      <div className="text-center py-12 bg-green-50 rounded-lg">
        <div className="text-4xl text-green-600 mb-2">✓</div>
        <p className="text-green-700 font-medium">No security issues detected</p>
        <p className="text-sm text-green-600 mt-1">
          All scanning tools completed without finding issues.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setSeverityFilter(filter)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                severityFilter === filter
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              {filter !== 'all' && counts[filter] > 0 && (
                <span className="ml-1 text-xs opacity-70">({counts[filter]})</span>
              )}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="px-3 py-1 text-sm border rounded-md bg-background"
        >
          <option value="severity">Sort by Severity</option>
          <option value="stage">Sort by Stage</option>
          <option value="tool">Sort by Tool</option>
          <option value="location">Sort by Location</option>
        </select>
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground mb-4">
        Showing {sortedFindings.length} of {findings.length} findings
        {counts.critical > 0 && (
          <span className="text-red-600 ml-2">• {counts.critical} critical</span>
        )}
        {counts.high > 0 && (
          <span className="text-orange-600 ml-2">• {counts.high} high</span>
        )}
      </div>

      {/* Findings List */}
      <div className="space-y-3">
        {sortedFindings.map((finding, index) => (
          <div
            key={`${finding.stage}-${finding.type}-${index}`}
            className={`border-l-4 rounded-lg overflow-hidden ${getSeverityColor(finding.severity)}`}
          >
            {/* Header */}
            <button
              onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
              className="w-full px-4 py-3 flex items-start justify-between hover:bg-black/5 transition-colors text-left"
            >
              <div className="flex items-start gap-3 flex-1">
                <span className="text-lg shrink-0">{getSeverityIcon(finding.severity)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${getSeverityBadgeColor(
                        finding.severity
                      )}`}
                    >
                      {finding.severity.toUpperCase()}
                    </span>
                    <span className="font-medium text-sm">
                      {getRemediation(finding.type).title}
                    </span>
                    {finding.corroborated && (
                      <span className="text-xs text-blue-600 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded">
                        Corroborated by {finding.corroborationCount} tools
                      </span>
                    )}
                  </div>
                  {/* Location on second line - more prominent */}
                  {finding.location && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-slate-500" />
                      <code className="text-xs text-slate-600 font-mono">
                        {finding.location}
                      </code>
                    </div>
                  )}
                </div>
              </div>
              <span className="text-slate-400 text-xs ml-2 shrink-0">
                {expandedIndex === index ? '▲' : '▼'}
              </span>
            </button>

            {/* Expanded Content */}
            {expandedIndex === index && (
              <ExpandedFinding finding={finding} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
