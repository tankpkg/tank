import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { desc, eq, sql } from 'drizzle-orm';

import { db } from '~/lib/db';
import { skills, skillVersions } from '~/lib/db/schema';
import { createSkillBot } from '~/lib/prompt2bot';

const nameParam = z.object({
  name: z.string().openapi({
    description: 'Package name (URL-encoded)',
    example: '@tank/react'
  })
});

const postTalkRoute = createRoute({
  method: 'post',
  path: '/{name}/talk',
  tags: ['Talk'],
  summary: 'Get or create a prompt2bot chat for a package',
  description: 'Lazily creates a prompt2bot bot for the latest published version. Returns chat link on success.',
  request: { params: nameParam },
  responses: {
    200: {
      description: 'Chat link',
      content: {
        'application/json': {
          schema: z.object({
            chatLink: z.string(),
            botPublicKey: z.string().nullable()
          })
        }
      }
    },
    404: {
      description: 'Package or version not found',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } }
    },
    500: {
      description: 'Bot creation failed',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } }
    },
    503: {
      description: 'Feature not configured',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } }
    }
  }
});

export const talkRoutes = new OpenAPIHono().openapi(postTalkRoute, async (c) => {
  const apiToken = process.env.PROMPT2BOT_API_TOKEN;
  if (!apiToken) {
    return c.json({ error: 'Talk to package feature is not configured' }, 503);
  }

  const { name: rawName } = c.req.valid('param');
  const name = decodeURIComponent(rawName);

  const skillRows = await db
    .select({ id: skills.id, description: skills.description })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);
  const skill = skillRows[0];
  if (!skill) return c.json({ error: 'Package not found' }, 404);

  const versionRows = await db
    .select({
      id: skillVersions.id,
      version: skillVersions.version,
      readme: skillVersions.readme,
      auditScore: skillVersions.auditScore,
      prompt2botBotId: skillVersions.prompt2botBotId,
      prompt2botChatLink: skillVersions.prompt2botChatLink,
      prompt2botBotPublicKey: skillVersions.prompt2botBotPublicKey
    })
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.createdAt))
    .limit(1);

  const version = versionRows[0];
  if (!version) return c.json({ error: 'No published version found' }, 404);

  if (version.prompt2botBotId && version.prompt2botChatLink) {
    return c.json(
      {
        chatLink: version.prompt2botChatLink,
        botPublicKey: version.prompt2botBotPublicKey
      },
      200
    );
  }

  const publisherRows = (await db.execute(
    sql`SELECT coalesce(u.name, '') AS name FROM skills s LEFT JOIN "user" u ON u.id = s.publisher_id WHERE s.id = ${skill.id}`
  )) as Record<string, unknown>[];
  const publisherName = (publisherRows[0]?.name as string) ?? '';

  const scanRows = (await db.execute(
    sql`SELECT verdict FROM scan_results WHERE version_id = ${version.id} ORDER BY created_at DESC LIMIT 1`
  )) as Record<string, unknown>[];
  const auditVerdict = (scanRows[0]?.verdict as string) ?? null;

  const repoRows = await db
    .select({ repositoryUrl: skills.repositoryUrl })
    .from(skills)
    .where(eq(skills.id, skill.id))
    .limit(1);
  const repositoryUrl = repoRows[0]?.repositoryUrl ?? null;

  const result = await createSkillBot({
    skillName: name,
    version: version.version,
    readme: version.readme,
    description: skill.description,
    publisherName,
    auditScore: version.auditScore,
    auditVerdict,
    repositoryUrl,
    apiToken
  });

  if (!result) {
    return c.json({ error: 'Failed to create bot' }, 500);
  }

  await db
    .update(skillVersions)
    .set({
      prompt2botBotId: result.botId,
      prompt2botChatLink: result.chatLink,
      prompt2botBotPublicKey: result.botPublicKey,
      prompt2botSecret: result.secret
    })
    .where(eq(skillVersions.id, version.id));

  return c.json(
    {
      chatLink: result.chatLink,
      botPublicKey: result.botPublicKey
    },
    200
  );
});
