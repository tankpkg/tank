import type { TankClient } from './client.js';
import { TankNotFoundError } from './errors.js';

export interface SkillToolInput {
  action: 'read' | 'list' | 'read_all';
  path?: string;
}

export interface SkillToolResult {
  success: boolean;
  content?: string;
  files?: string[];
  skill?: {
    content: string;
    references: Record<string, string>;
    scripts: Record<string, string>;
    files: string[];
  };
  error?: string;
}

export interface OpenAIFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface SkillTool {
  name: string;
  skillName: string;
  version: string;
  description: string;
  files: string[];
  execute(input: SkillToolInput): Promise<SkillToolResult>;
  toOpenAI(): OpenAIFunctionTool;
  toMCP(): MCPToolDefinition;
}

const MAX_TOOL_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_FILES_IN_DESCRIPTION = 30;
const MAX_FILES_IN_ERROR = 10;

function sanitizeToolName(skillName: string): string {
  const raw = skillName
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+/, '')
    .replace(/_+/g, '_');
  return raw.slice(0, MAX_TOOL_NAME_LENGTH) || 'skill_tool';
}

function buildParameterSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['action'],
    additionalProperties: false,
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'list', 'read_all'],
        description:
          'read: read a single file (requires path). list: list all files. read_all: complete skill with references and scripts.'
      },
      path: {
        type: 'string',
        description: 'File path to read (required when action is "read"). Example: "SKILL.md", "references/guide.md"'
      }
    }
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function buildDescription(skillName: string, version: string, skillDescription: string, files: string[]): string {
  const refFiles = files.filter((f) => f.startsWith('references/'));
  const scriptFiles = files.filter((f) => f.startsWith('scripts/'));

  const displayFiles =
    files.length <= MAX_FILES_IN_DESCRIPTION
      ? files.join(', ')
      : `${files.slice(0, MAX_FILES_IN_DESCRIPTION).join(', ')} and ${files.length - MAX_FILES_IN_DESCRIPTION} more`;

  const parts = [
    `Access the "${skillName}" skill (v${version}).`,
    truncate(skillDescription, 200),
    '',
    'Actions: read_all | list | read (with path)',
    `Files (${files.length}): ${displayFiles}`
  ];

  if (refFiles.length > 0) {
    parts.push(`References: ${refFiles.map((f) => f.replace('references/', '')).join(', ')}`);
  }
  if (scriptFiles.length > 0) {
    parts.push(`Scripts: ${scriptFiles.map((f) => f.replace('scripts/', '')).join(', ')}`);
  }

  return truncate(parts.join('\n'), MAX_DESCRIPTION_LENGTH);
}

export async function createSkillTool(client: TankClient, skillName: string, version?: string): Promise<SkillTool> {
  const info = await client.info(skillName);
  const ver = version ?? info.latestVersion;
  if (!ver) throw new TankNotFoundError(`No published versions for ${skillName}`, skillName);

  const files = await client.listFiles(skillName, ver);
  const filesSet = new Set(files);
  const toolName = sanitizeToolName(skillName);
  const description = buildDescription(skillName, ver, info.description ?? '', files);
  const parameterSchema = buildParameterSchema();

  async function execute(input: SkillToolInput): Promise<SkillToolResult> {
    try {
      switch (input.action) {
        case 'list':
          return { success: true, files };

        case 'read': {
          if (!input.path) {
            return { success: false, error: 'path is required for action "read"' };
          }
          if (!filesSet.has(input.path)) {
            const hint = files.slice(0, MAX_FILES_IN_ERROR).join(', ');
            const suffix = files.length > MAX_FILES_IN_ERROR ? ` and ${files.length - MAX_FILES_IN_ERROR} more` : '';
            return { success: false, error: `File not found: ${input.path}. Available: ${hint}${suffix}` };
          }
          const content = await client.readFile(skillName, ver, input.path);
          return { success: true, content };
        }

        case 'read_all': {
          const skill = await client.readSkill(skillName, ver);
          return {
            success: true,
            skill: {
              content: skill.content,
              references: skill.references,
              scripts: skill.scripts,
              files: skill.files
            }
          };
        }

        default:
          return { success: false, error: `Unknown action: ${String((input as { action: unknown }).action)}` };
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    name: toolName,
    skillName,
    version: ver,
    description,
    files,
    execute,

    toOpenAI(): OpenAIFunctionTool {
      return {
        type: 'function',
        function: { name: toolName, description, parameters: parameterSchema }
      };
    },

    toMCP(): MCPToolDefinition {
      return { name: toolName, description, inputSchema: parameterSchema };
    }
  };
}

export async function createSkillTools(client: TankClient, skillNames: string[]): Promise<SkillTool[]> {
  const tools: SkillTool[] = [];
  for (let i = 0; i < skillNames.length; i += 6) {
    const batch = skillNames.slice(i, i + 6);
    const batchTools = await Promise.all(batch.map((name) => createSkillTool(client, name)));
    tools.push(...batchTools);
  }
  return tools;
}
