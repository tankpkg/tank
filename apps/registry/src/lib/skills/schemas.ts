import { z } from "zod";

export const sortOptionSchema = z.enum(["updated", "downloads", "stars", "score", "name"]);
export const visibilityFilterSchema = z.enum(["all", "public", "private"]);
export const securityVerdictSchema = z.enum(["all", "pass", "pass_with_notes", "flagged", "fail"]);
export const freshnessBucketSchema = z.enum(["all", "week", "month", "year"]);
export const popularityBucketSchema = z.enum(["all", "popular", "growing", "new"]);

export type SortOption = z.infer<typeof sortOptionSchema>;
export type VisibilityFilter = z.infer<typeof visibilityFilterSchema>;
export type SecurityVerdict = z.infer<typeof securityVerdictSchema>;
export type FreshnessBucket = z.infer<typeof freshnessBucketSchema>;
export type PopularityBucket = z.infer<typeof popularityBucketSchema>;

export const skillsSearchSchema = z
  .object({
    q: z.string().catch("").default(""),
    page: z.coerce.number().min(1).catch(1).default(1),
    sort: sortOptionSchema.catch("updated").default("updated"),
    visibility: visibilityFilterSchema.catch("all").default("all"),
    security: securityVerdictSchema.catch("all").default("all"),
    freshness: freshnessBucketSchema.catch("all").default("all"),
    popularity: popularityBucketSchema.catch("all").default("all"),
    docs: z
      .preprocess((v) => v === "1" || v === true, z.boolean())
      .catch(false)
      .default(false),
    atomKind: z.string().optional(),
  })
  .transform(({ security, docs, ...rest }) => ({
    ...rest,
    securityVerdict: security,
    hasReadme: docs,
  }));

export interface SkillsSearchParams {
  q: string;
  page: number;
  limit: number;
  sort: SortOption;
  visibility: VisibilityFilter;
  securityVerdict: SecurityVerdict;
  freshness?: FreshnessBucket;
  popularity?: PopularityBucket;
  hasReadme?: boolean;
  atomKind?: string;
  requesterUserId?: string | null;
}
