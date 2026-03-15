import { sql } from 'drizzle-orm';

export function visibilityClause(requesterUserId: string | null) {
  if (!requesterUserId) {
    return sql`s.visibility = 'public'`;
  }

  return sql`(
    s.visibility = 'public'
    OR s.publisher_id = ${requesterUserId}
    OR (
      s.visibility = 'private'
      AND (
        (s.org_id IS NOT NULL AND EXISTS (SELECT 1 FROM "member" m WHERE m.organization_id = s.org_id AND m.user_id = ${requesterUserId}))
        OR EXISTS (
          SELECT 1
          FROM skill_access sa
          WHERE sa.skill_id = s.id
            AND (
              sa.granted_user_id = ${requesterUserId}
              OR (
                sa.granted_org_id IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM "member" m2
                  WHERE m2.organization_id = sa.granted_org_id
                    AND m2.user_id = ${requesterUserId}
                )
              )
            )
        )
      )
    )
  )`;
}
