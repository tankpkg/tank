export type ClawGuardSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ClawGuardCategory =
  | 'prompt_injection'
  | 'code_obfuscation'
  | 'data_exfiltration'
  | 'dangerous_command'
  | 'shell_injection'
  | 'social_engineering'
  | 'tool_manipulation';

export type ClawGuardPattern = {
  readonly name: string;
  readonly regex: RegExp;
  readonly severity: ClawGuardSeverity;
  readonly category: ClawGuardCategory;
  readonly recommendation: string;
};
