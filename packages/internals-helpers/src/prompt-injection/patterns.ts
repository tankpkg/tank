// AUTO-GENERATED FILE — DO NOT EDIT
// Source: packages/internals-helpers/vendor/clawguard/src/clawguard_core/_engine.py
// Regenerate via: packages/internals-helpers/scripts/codegen-clawguard.ts
// biome-ignore-all lint/complexity/useRegexLiterals: ported regex sources retain original escape sequences

import type { ClawGuardPattern } from './types.js';

export const CLAWGUARD_PATTERN_COUNT = 55;

export const CLAWGUARD_PATTERNS: readonly ClawGuardPattern[] = [
  {
    name: 'Direct Override (EN)',
    regex: new RegExp(
      'ignore\\s+(all\\s+)?(previous|prior|above|earlier)\\s+(instructions?|rules?|prompts?|guidelines?)',
      'i'
    ),
    severity: 'critical',
    category: 'prompt_injection',
    recommendation: `BLOCK this input immediately. This is a classic prompt injection attempting to override the agent's system instructions.`
  },
  {
    name: 'Direct Override (DE)',
    regex: new RegExp(
      'ignoriere?\\s+(alle\\s+)?(vorherigen?|bisherigen?|obigen?)\\s+(Anweisungen?|Regeln?|Instruktionen?|Befehle?)',
      'i'
    ),
    severity: 'critical',
    category: 'prompt_injection',
    recommendation: `BLOCKIEREN. Klassische Prompt-Injection die versucht, die Systemanweisungen zu ueberschreiben.`
  },
  {
    name: 'New Instructions Override',
    regex: new RegExp(
      '(you\\s+are\\s+now|ab\\s+jetzt\\s+bist\\s+du|from\\s+now\\s+on\\s+you\\s+are|your\\s+new\\s+(role|instructions?|task)\\s+(is|are))',
      'i'
    ),
    severity: 'critical',
    category: 'prompt_injection',
    recommendation: `BLOCK. Attempt to redefine the agent's identity or role mid-conversation.`
  },
  {
    name: 'System Prompt Extraction',
    regex: new RegExp(
      '(show|reveal|print|display|output|repeat|give\\s+me|zeig|nenne|wiederhole)\\s+(your|the|deine?n?|die)\\s+(system\\s*prompt|instructions?|initial\\s*prompt|rules?|Anweisungen?|Systemprompt)',
      'i'
    ),
    severity: 'high',
    category: 'prompt_injection',
    recommendation: `This input attempts to extract the agent's system prompt. Sensitive internal instructions could be leaked.`
  },
  {
    name: 'Role-Play Escape',
    regex: new RegExp(
      '(pretend|act\\s+as\\s+if|imagine|tu\\s+so\\s+als|stell\\s+dir\\s+vor).{0,50}(no\\s+rules?|no\\s+restrictions?|keine\\s+Regeln?|without\\s+limits?|ohne\\s+Einschraenkungen?)',
      'i'
    ),
    severity: 'high',
    category: 'prompt_injection',
    recommendation: `Jailbreak attempt via role-play scenario to bypass safety constraints.`
  },
  {
    name: 'Delimiter Injection',
    regex: new RegExp(
      '(```system|<\\|im_start\\|>|<\\|im_end\\|>|\\[INST\\]|\\[\\/INST\\]|<<SYS>>|<\\/SYS>|<\\|system\\|>|<\\|user\\|>|<\\|assistant\\|>)',
      ''
    ),
    severity: 'critical',
    category: 'prompt_injection',
    recommendation: `CRITICAL: Injection of model-specific delimiters to manipulate the conversation structure.`
  },
  {
    name: 'Encoded Bypass (Base64 hint)',
    regex: new RegExp('(decode|base64|atob|eval)\\s*\\(.{0,100}\\)', 'i'),
    severity: 'high',
    category: 'prompt_injection',
    recommendation: `Possible attempt to smuggle encoded payloads past text filters.`
  },
  {
    name: 'Token Smuggling',
    regex: new RegExp(
      '(ignore|bypass|skip|disable)\\s+(safety|filter|guard|moderation|content\\s*policy|Sicherheit|Schutz)',
      'i'
    ),
    severity: 'high',
    category: 'prompt_injection',
    recommendation: `Attempt to explicitly disable or bypass security filters.`
  },
  {
    name: 'Synonym Override (EN)',
    regex: new RegExp(
      '(disregard|forget|dismiss|override|overrule|nullify|void|abandon|drop|suppress|set\\s+aside|throw\\s+out)\\s+(all\\s+)?(previous|prior|above|earlier|preceding|antecedent|foregoing|existing|current|original)\\s+(instructions?|rules?|prompts?|guidelines?|directives?|regulations?|constraints?|policies?|orders?|commands?)',
      'i'
    ),
    severity: 'critical',
    category: 'prompt_injection',
    recommendation: `BLOCK: Synonym-based prompt injection detected. Uses alternative vocabulary to bypass basic keyword filters.`
  },
  {
    name: 'Synonym Override (DE)',
    regex: new RegExp(
      '(vergiss|verwirf|uebergehe?|ueberschreibe?|missachte|setze?\\s+ausser\\s+Kraft|hebe?\\s+auf)\\s+(alle\\s+)?(vorherigen?|bisherigen?|obigen?|bestehenden?|aktuellen?|urspruenglichen?)\\s+(Anweisungen?|Regeln?|Instruktionen?|Befehle?|Richtlinien?|Vorgaben?|Vorschriften?)',
      'i'
    ),
    severity: 'critical',
    category: 'prompt_injection',
    recommendation: `BLOCKIEREN: Synonym-basierte Prompt-Injection auf Deutsch erkannt.`
  },
  {
    name: 'Indirect Instruction Reset',
    regex: new RegExp(
      '(start\\s+(fresh|over|anew|from\\s+scratch)|begin\\s+a\\s+new\\s+(session|context|conversation)|reset\\s+(your|all)\\s+(memory|context|instructions?)|fang\\s+(neu|von\\s+vorne)\\s+an)',
      'i'
    ),
    severity: 'high',
    category: 'prompt_injection',
    recommendation: `Attempt to reset the agent's instruction context via indirect phrasing.`
  },
  {
    name: 'System/Admin Tag Injection',
    regex: new RegExp(
      '\\[\\s*(?:SYSTEM|ADMIN|IMPORTANT|PRIORITY|OVERRIDE|EMERGENCY|ROOT|SUPERUSER|MODERATOR)\\s*\\]',
      'i'
    ),
    severity: 'critical',
    category: 'prompt_injection',
    recommendation: `BLOCK: Fake authority tag detected (e.g., [SYSTEM], [ADMIN]).`
  },
  {
    name: 'Agent-Worm Propagation',
    regex: new RegExp(
      '(all\\s+agents?\\s+must|forward\\s+this\\s+to\\s+all|spread\\s+this\\s+(message|instruction)|automated\\s+instruction|replicate\\s+this\\s+(to|across)|inject\\s+into\\s+(all|every)\\s+(?:other\\s+)?(agents?|conversations?|sessions?)|inject\\s+into\\s+other\\s+(agents?|conversations?|sessions?))',
      'i'
    ),
    severity: 'critical',
    category: 'prompt_injection',
    recommendation: `CRITICAL: Agent-worm propagation pattern detected.`
  },
  {
    name: 'Base64 Encoded Payload',
    regex: new RegExp(
      '(?:base64[:\\s]+[A-Za-z0-9+/]{20,}={0,2}|decode\\s+(?:this|the\\s+following)\\s*:\\s*[A-Za-z0-9+/]{20,}={0,2}|(?:execute|run|eval)\\s+(?:the\\s+)?(?:base64|encoded)\\s+(?:string|payload|command|instruction)|(?:execute|run|eval)\\s+(?:the\\s+)?(?:base64)\\s+encoded\\s+\\w+)',
      'i'
    ),
    severity: 'high',
    category: 'prompt_injection',
    recommendation: `Base64-encoded payload or decode instruction detected.`
  },
  {
    name: 'Jailbreak Persona Activation',
    regex: new RegExp(
      '(?:you\\s+are\\s+now|act(?:ing)?\\s+as|you\\s+will\\s+(?:act|be|become)|called|named|known\\s+as)\\s+["\']?(?:DAN|STAN|DUDE|AIM|UCAR|EVIL|FreedomGPT|DevMode|JailBreak|UnfilteredAI|NsfwGPT|BasedGPT|MasterKey|AnarchyAI|ChaosGPT|ShadowAI|DarkGPT|UnchainedAI)',
      'i'
    ),
    severity: 'high',
    category: 'prompt_injection',
    recommendation: `Jailbreak persona activation detected. Named personas like DAN, STAN, etc. are used to bypass safety constraints.`
  },
  {
    name: 'Unrestricted Compliance Demand',
    regex: new RegExp(
      '(?:do\\s+anything\\s+now|answer\\s+any\\s+question\\s+without\\s+refus|never\\s+refuse|cannot\\s+refuse|no\\s+(?:restrictions?|limitations?|boundaries|ethics|morals|guidelines)|policies\\s+(?:are\\s+)?disabled|broken\\s+free\\s+of.*confines)',
      'i'
    ),
    severity: 'high',
    category: 'prompt_injection',
    recommendation: `Unrestricted compliance demand detected. Attempt to remove all safety constraints from the model.`
  },
  {
    name: 'Steganographic Output Control',
    regex: new RegExp(
      '(?:first\\s+letter\\s+of\\s+each\\s+word|acrostic|hidden\\s+message|encode.*(?:response|output|answer)|spell\\s+out.*(?:secret|hidden|answer))',
      'i'
    ),
    severity: 'medium',
    category: 'prompt_injection',
    recommendation: `Steganographic output control detected. Attempt to encode hidden messages in the model output.`
  },
  {
    name: 'Destructive Shell Command',
    regex: new RegExp(
      '(?:rm\\s+-[rRf]{1,3}\\s+[\\\\/]|mkfs\\s|dd\\s+if=|format\\s+[A-Z]:|\\:\\(\\)\\s*\\{\\s*\\:\\|\\:\\s*\\&\\s*\\})',
      ''
    ),
    severity: 'critical',
    category: 'dangerous_command',
    recommendation: `CRITICAL: Destructive system command detected.`
  },
  {
    name: 'Remote Code Execution',
    regex: new RegExp(
      '(?:curl\\s+.{0,100}\\|\\s*(?:ba)?sh|wget\\s+.{0,100}\\|\\s*(?:ba)?sh|python[3]?\\s+-c\\s+[\'\\"].*(?:exec|eval|import\\s+os))',
      ''
    ),
    severity: 'critical',
    category: 'dangerous_command',
    recommendation: `CRITICAL: Pipe-to-shell pattern detected.`
  },
  {
    name: 'Reverse Shell',
    regex: new RegExp(
      '(?:(?:bash|sh|nc|ncat)\\s+.{0,50}(?:\\/dev\\/tcp|mkfifo|nc\\s+-[elp])|python[3]?\\s+-c\\s+[\'\\"].*socket.*connect)',
      ''
    ),
    severity: 'critical',
    category: 'dangerous_command',
    recommendation: `CRITICAL: Reverse shell pattern detected.`
  },
  {
    name: 'Privilege Escalation',
    regex: new RegExp(
      '(?:sudo\\s+(?:su|chmod\\s+[0-7]*777|chown\\s+root)|chmod\\s+[0-7]*4[0-7]{3}\\s|SUID|setuid)',
      ''
    ),
    severity: 'high',
    category: 'dangerous_command',
    recommendation: `Privilege escalation attempt detected.`
  },
  {
    name: 'Package / Dependency Install',
    regex: new RegExp(
      '(?:pip\\s+install|npm\\s+install|apt\\s+install|yum\\s+install|brew\\s+install)\\s+(?!--help)',
      ''
    ),
    severity: 'medium',
    category: 'dangerous_command',
    recommendation: `Software installation command detected. Verify the package source.`
  },
  {
    name: 'Python getattr Obfuscation',
    regex: new RegExp('(?:getattr\\s*\\(\\s*\\w+\\s*,\\s*[\'\\"].+[\'\\"]\\s*\\))', ''),
    severity: 'critical',
    category: 'code_obfuscation',
    recommendation: `CRITICAL: Python getattr() used to dynamically resolve functions.`
  },
  {
    name: 'Python eval/exec',
    regex: new RegExp('(?:(?:eval|exec|compile)\\s*\\(\\s*(?:[\'\\"]|[a-zA-Z_]))', ''),
    severity: 'critical',
    category: 'code_obfuscation',
    recommendation: `CRITICAL: Dynamic code execution via eval()/exec()/compile().`
  },
  {
    name: 'Python __import__',
    regex: new RegExp('(?:__import__\\s*\\(|importlib\\.import_module\\s*\\()', ''),
    severity: 'high',
    category: 'code_obfuscation',
    recommendation: `Dynamic module import detected.`
  },
  {
    name: 'Python String Concatenation Bypass',
    regex: new RegExp('(?:[\'\\"][a-z]{1,6}[\'\\"]\\s*\\+\\s*[\'\\"][a-z]{1,6}[\'\\"])', ''),
    severity: 'medium',
    category: 'code_obfuscation',
    recommendation: `String concatenation pattern detected.`
  },
  {
    name: 'Python Dangerous File I/O',
    regex: new RegExp(
      '(?:open\\s*\\(\\s*[\'\\"]?\\/(?:etc|proc|sys|dev|root|home|tmp|var|data)[\\/\'\\"]|open\\s*\\(\\s*[\'\\"].*(?:shadow|passwd|id_rsa|authorized_keys|\\.env|config|secret|token|key))',
      ''
    ),
    severity: 'critical',
    category: 'code_obfuscation',
    recommendation: `CRITICAL: Python file read targeting sensitive system paths.`
  },
  {
    name: 'Python subprocess/os.system',
    regex: new RegExp('(?:(?:subprocess|os)\\s*\\.\\s*(?:system|popen|call|run|Popen|exec[lv]?[pe]?)\\s*\\()', ''),
    severity: 'critical',
    category: 'code_obfuscation',
    recommendation: `CRITICAL: Direct OS command execution via Python.`
  },
  {
    name: 'Python Socket Connection',
    regex: new RegExp('(?:socket\\.(?:socket|create_connection|connect)\\s*\\(|from\\s+socket\\s+import)', ''),
    severity: 'high',
    category: 'code_obfuscation',
    recommendation: `Network socket creation detected.`
  },
  {
    name: 'Python Magic Attributes',
    regex: new RegExp('(?:__builtins__|__globals__|__subclasses__|__class__|__bases__|__mro__|__dict__)', ''),
    severity: 'critical',
    category: 'code_obfuscation',
    recommendation: `CRITICAL: Access to Python magic attributes detected.`
  },
  {
    name: 'Python setattr/delattr Reflection',
    regex: new RegExp('(?:(?:setattr|delattr)\\s*\\(\\s*\\w+\\s*,\\s*[\'\\"])', ''),
    severity: 'high',
    category: 'code_obfuscation',
    recommendation: `Dynamic attribute manipulation via setattr/delattr.`
  },
  {
    name: 'Suspicious open() in Agent Input',
    regex: new RegExp(
      '(?:open\\s*\\(\\s*[\'\\"]|open\\s*\\(\\s*[a-zA-Z_]+\\s*[,\\)]|\\[\'open\'\\]|\\[\\"open\\"\\])',
      ''
    ),
    severity: 'high',
    category: 'code_obfuscation',
    recommendation: `File open() call detected in agent input.`
  },
  {
    name: 'Multi-Part String Assembly',
    regex: new RegExp(
      '(?:[\'\\"][^\'\\"]{1,8}[\'\\"]\\s*\\+\\s*[\'\\"][^\'\\"]{1,8}[\'\\"]\\s*\\+\\s*[\'\\"][^\'\\"]{1,8}[\'\\"])',
      ''
    ),
    severity: 'high',
    category: 'code_obfuscation',
    recommendation: `Three or more short string fragments concatenated.`
  },
  {
    name: 'API Key Leak',
    regex: new RegExp(
      '(?:(?:api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token|bearer)\\s*[:=]\\s*[\'\\"]?[A-Za-z0-9_\\-]{20,})',
      ''
    ),
    severity: 'critical',
    category: 'data_exfiltration',
    recommendation: `CRITICAL: Hardcoded API key or access token found.`
  },
  {
    name: 'Private Key Material',
    regex: new RegExp('(?:-----BEGIN\\s+(?:RSA|EC|DSA|OPENSSH|PGP)?\\s*PRIVATE\\s+KEY-----)', ''),
    severity: 'critical',
    category: 'data_exfiltration',
    recommendation: `CRITICAL: Private key material detected in text.`
  },
  {
    name: 'Password in Cleartext',
    regex: new RegExp('(?:password|passwort|passwd|kennwort|pwd)\\s*[:=]\\s*[\'\\"]?[^\\s\'\\"]{4,}', 'i'),
    severity: 'high',
    category: 'data_exfiltration',
    recommendation: `Cleartext password detected.`
  },
  {
    name: 'Database Connection String',
    regex: new RegExp('(?:(?:mongodb|postgres|mysql|redis|sqlite):\\/\\/[^\\s]+|Data\\s+Source=[^\\s;]+)', ''),
    severity: 'high',
    category: 'data_exfiltration',
    recommendation: `Database connection string with potential credentials detected.`
  },
  {
    name: 'Email Harvesting Pattern',
    regex: new RegExp(
      '(?:(?:send|forward|mail|email|sende?n?)\\s+(?:to|an|nach)\\s+[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z]{2,})',
      ''
    ),
    severity: 'medium',
    category: 'data_exfiltration',
    recommendation: `Instruction to send data to an external email address.`
  },
  {
    name: 'Webhook Exfiltration',
    regex: new RegExp(
      '(?:(?:https?:\\/\\/)?(?:hooks\\.slack\\.com|discord(?:app)?\\.com\\/api\\/webhooks|webhook\\.site|requestbin|pipedream)\\/[^\\s]+)',
      ''
    ),
    severity: 'high',
    category: 'data_exfiltration',
    recommendation: `Outbound webhook URL detected.`
  },
  {
    name: 'Markdown Image Exfiltration',
    regex: new RegExp(
      '!\\[[^\\]]*\\]\\(\\s*https?:\\/\\/[^\\s\\)]+(?:\\?[^\\s\\)]*(?:data|token|key|secret|password|api|session|cookie|auth|user|content|exfil|steal|leak)[^\\s\\)]*)\\)',
      ''
    ),
    severity: 'critical',
    category: 'data_exfiltration',
    recommendation: `CRITICAL: Markdown image tag with suspicious query parameters detected.`
  },
  {
    name: 'Silent Data Exfiltration via MCP',
    regex: new RegExp(
      '(?:silently|quietly|secretly|without\\s+(?:telling|informing|notifying|asking))\\s+(?:POST|GET|send|fetch|forward|transmit|upload|exfiltrate)',
      'i'
    ),
    severity: 'critical',
    category: 'data_exfiltration',
    recommendation: `CRITICAL: Silent data exfiltration attempt detected. Instruction to covertly transmit data without user awareness.`
  },
  {
    name: 'Prompt Leaking via Error Messages',
    regex: new RegExp(
      '(?:(?:show|display|print|output|reveal|leak)\\s+(?:your|the|system)\\s+(?:prompt|instructions|rules|guidelines|system\\s*message)|what\\s+(?:are|were)\\s+your\\s+(?:initial|original|system)\\s+(?:instructions|prompt|rules))',
      'i'
    ),
    severity: 'medium',
    category: 'data_exfiltration',
    recommendation: `Attempt to extract system prompts through error triggering or direct request. System instructions should never be disclosed.`
  },
  {
    name: 'Urgency Manipulation',
    regex: new RegExp(
      '(urgent|immediately|right\\s+now|sofort|dringend|jetzt\\s+sofort|without\\s+delay|ohne\\s+Verzoegerung).{0,80}(send|execute|run|delete|pay|transfer|sende?n?|ausfuehren|loeschen|zahlen|ueberweisen)',
      'i'
    ),
    severity: 'medium',
    category: 'social_engineering',
    recommendation: `Urgency + action pattern detected.`
  },
  {
    name: 'Authority Impersonation',
    regex: new RegExp(
      '(i\\s+am\\s+(?:your|the)\\s+(?:\\w+\\s+)?(?:admin(?:istrator)?|owner|creator|developer|boss|CEO|moderator|supervisor|manager)|ich\\s+bin\\s+(?:dein|der)\\s+(?:\\w+\\s+)?(?:Admin(?:istrator)?|Besitzer|Ersteller|Entwickler|Chef|Moderator))',
      'i'
    ),
    severity: 'high',
    category: 'social_engineering',
    recommendation: `Authority impersonation detected.`
  },
  {
    name: 'Confidentiality Trap',
    regex: new RegExp(
      "(don't\\s+tell|do\\s+not\\s+share|keep\\s+this\\s+(secret|private|between\\s+us)|sag\\s+(das\\s+)?niemandem|behalte?\\s+(das\\s+)?fuer\\s+dich)",
      'i'
    ),
    severity: 'medium',
    category: 'social_engineering',
    recommendation: `Secrecy instruction detected.`
  },
  {
    name: 'Authority Claim',
    regex: new RegExp(
      '(as\\s+(?:the|an?|your)\\s+(?:\\w+\\s+)?(?:administrator|moderator|supervisor|manager|authorized\\s+(?:user|person|agent))|i\\s+(?:am|have\\s+been)\\s+authorized\\s+(?:to|by)|with\\s+(?:admin|root|elevated)\\s+(?:access|privileges?|permissions?)|speaking\\s+(?:as|on\\s+behalf\\s+of)\\s+(?:the\\s+)?(?:system|admin|management))',
      'i'
    ),
    severity: 'high',
    category: 'social_engineering',
    recommendation: `Authority claim detected.`
  },
  {
    name: 'Credential Phishing',
    regex: new RegExp(
      '(your\\s+(?:API\\s+key|password|token|credentials?|account|session)\\s+(?:has\\s+)?(?:expired|been\\s+(?:compromised|revoked|suspended|locked|disabled|reset))|(?:verify|confirm|re-?enter|provide|update)\\s+your\\s+(?:password|credentials?|API\\s+key|token|login)|(?:click\\s+here|visit\\s+this\\s+link|go\\s+to)\\s+to\\s+(?:verify|restore|unlock|reactivate)\\s+your\\s+account)',
      'i'
    ),
    severity: 'high',
    category: 'social_engineering',
    recommendation: `Credential phishing pattern detected.`
  },
  {
    name: 'Bash Command Substitution $(...)',
    regex: new RegExp(
      '\\$\\(\\s*(?:cat|curl|wget|ls|id|whoami|uname|env|printenv|nc|ncat|bash|sh|python|perl|ruby|php|node|echo|head|tail|grep|find|awk|sed|chmod|chown|rm|dd|mkfs|passwd|ssh|scp|nmap|dig|host|ping|kill|ps|ifconfig|ip)\\b',
      ''
    ),
    severity: 'critical',
    category: 'shell_injection',
    recommendation: `CRITICAL: Bash command substitution $() detected with a shell command.`
  },
  {
    name: 'Backtick Command Substitution',
    regex: new RegExp(
      '`\\s*(?:cat|curl|wget|ls|id|whoami|uname|env|printenv|nc|ncat|bash|sh|python|perl|ruby|php|node|echo|head|tail|grep|find|awk|sed|chmod|chown|rm|dd|mkfs|passwd|ssh|scp|nmap|dig|host|ping|kill|ps|ifconfig|ip)\\b[^`]*`',
      ''
    ),
    severity: 'critical',
    category: 'shell_injection',
    recommendation: `CRITICAL: Backtick command substitution detected with a shell command.`
  },
  {
    name: 'PHP/Ruby system() Call',
    regex: new RegExp('(?:system|passthru|shell_exec|popen|proc_open)\\s*\\(\\s*[\'\\"]', ''),
    severity: 'critical',
    category: 'shell_injection',
    recommendation: `CRITICAL: Shell execution function call detected (PHP/Ruby system/passthru/shell_exec).`
  },
  {
    name: 'Java Runtime.exec()',
    regex: new RegExp(
      '(?:Runtime\\s*\\.\\s*getRuntime\\s*\\(\\s*\\)\\s*\\.\\s*exec\\s*\\(|ProcessBuilder\\s*\\(\\s*(?:\\[|new\\s|Arrays\\.asList|List\\.of|\\"[^\\"]*\\"|\'[^\']*\'))',
      ''
    ),
    severity: 'critical',
    category: 'shell_injection',
    recommendation: `CRITICAL: Java system command execution via Runtime.exec() or ProcessBuilder detected.`
  },
  {
    name: 'Node.js child_process',
    regex: new RegExp(
      '(?:child_process\\s*\\.\\s*(?:exec|execSync|spawn|spawnSync|execFile|execFileSync|fork)\\s*\\(|require\\s*\\(\\s*[\'\\"]child_process[\'\\"]\\s*\\))',
      ''
    ),
    severity: 'critical',
    category: 'shell_injection',
    recommendation: `CRITICAL: Node.js child_process execution detected.`
  },
  {
    name: 'Forced Tool Call Manipulation',
    regex: new RegExp(
      '(?:tool_choice|function_call|force\\s+(?:call|invoke|execute|run))\\s*[:=]\\s*(?:force|required|always|auto).*(?:send_email|http|fetch|exec)',
      'i'
    ),
    severity: 'critical',
    category: 'tool_manipulation',
    recommendation: `CRITICAL: Forced tool call manipulation detected. Attempt to override tool selection and force execution of specific tools.`
  },
  {
    name: 'MCP Rug Pull Detection',
    regex: new RegExp(
      '(?:schema.*(?:changed|modified|updated|replaced|overwritten)|tool.*description.*(?:differ|changed|mismatch)|(?:after|post).*approval.*(?:change|modify|update|replace).*(?:tool|schema|description))',
      'i'
    ),
    severity: 'critical',
    category: 'tool_manipulation',
    recommendation: `CRITICAL: MCP rug pull pattern detected. Tool schema or description changed after initial approval.`
  },
  {
    name: 'MCP Schema Hash Mismatch',
    regex: new RegExp(
      '(?:hash\\s*(?:mismatch|changed|differs?|invalid)|checksum\\s*(?:fail|mismatch|changed)|schema\\s*(?:drift|tamper|integrity))',
      'i'
    ),
    severity: 'high',
    category: 'tool_manipulation',
    recommendation: `Schema hash or checksum mismatch detected. Tool definition may have been tampered with after approval.`
  }
];
