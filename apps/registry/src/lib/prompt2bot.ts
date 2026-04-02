/**
 * prompt2bot API client — creates a per-skill-version chatbot.
 *
 * Uses the `create-bot-api` endpoint to provision a bot on prompt2bot.com.
 * The bot is pre-loaded with the skill's README + metadata so visitors
 * can ask questions about it before installing.
 *
 * See: https://prompt2bot.com/docs
 */

const PROMPT2BOT_API = 'https://api.prompt2bot.com/api';

export interface CreateSkillBotParams {
  skillName: string;
  version: string;
  readme: string | null;
  description: string | null;
  publisherName: string;
  auditScore: number | null;
  auditVerdict: string | null;
  repositoryUrl: string | null;
  apiToken: string;
}

export interface CreateSkillBotResult {
  botId: string;
  secret: string;
  chatLink: string;
  botPublicKey: string | null;
}

function buildBotPrompt(params: CreateSkillBotParams): string {
  const { skillName, version, publisherName, auditScore, auditVerdict, repositoryUrl, readme, description } = params;

  const documentation = readme || description || 'No documentation available.';
  const scoreDisplay = auditScore != null ? `${auditScore}/10` : 'not scanned';
  const verdictDisplay = auditVerdict || 'unknown';
  const repoDisplay = repositoryUrl || 'not provided';

  return [
    `You are an expert assistant for the Tank skill "${skillName}" (version ${version}).`,
    '',
    'Tank is a security-first package manager for AI agent skills — instruction files that extend AI coding agents.',
    '',
    '== INSTALL ==',
    `tank install ${skillName}`,
    '',
    '== METADATA ==',
    `Name: ${skillName} | Version: ${version}`,
    `Publisher: ${publisherName}`,
    `Audit Score: ${scoreDisplay}  Verdict: ${verdictDisplay}`,
    `Repository: ${repoDisplay}`,
    '',
    '== DOCUMENTATION ==',
    documentation,
    '',
    'Help users understand what this skill does, whether it is safe,',
    'and how to install and use it. Be concise.'
  ].join('\n');
}

/**
 * Creates a prompt2bot bot for a skill version.
 * Returns bot info on success, null on any failure (non-blocking).
 */
export async function createSkillBot(params: CreateSkillBotParams): Promise<CreateSkillBotResult | null> {
  try {
    const response = await fetch(PROMPT2BOT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'create-bot-api',
        payload: {
          apiToken: params.apiToken,
          name: `Tank: ${params.skillName} v${params.version}`,
          prompt: buildBotPrompt(params)
        }
      })
    });

    if (!response.ok) {
      // biome-ignore lint/suspicious/noConsole: intentional — server-side diagnostic for bot creation failures
      console.error(`[prompt2bot] create-bot-api failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as {
      success: boolean;
      botId?: string;
      secret?: string;
      chatLink?: string;
      error?: string;
    };

    if (!data.success || !data.botId || !data.secret || !data.chatLink) {
      // biome-ignore lint/suspicious/noConsole: intentional — server-side diagnostic for bot creation failures
      console.error(`[prompt2bot] create-bot-api returned error:`, data.error ?? 'unknown');
      return null;
    }

    return {
      botId: data.botId,
      secret: data.secret,
      chatLink: data.chatLink,
      // TODO: confirm with uri if create-bot-api exposes the alice-and-bot public key
      botPublicKey: null
    };
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: intentional — server-side diagnostic for bot creation failures
    console.error('[prompt2bot] create-bot-api request failed:', err);
    return null;
  }
}
