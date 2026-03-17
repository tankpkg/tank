import { z } from 'zod';

export const sortOptionSchema = z.enum(['updated', 'downloads', 'stars', 'score', 'name']);
export const visibilityFilterSchema = z.enum(['all', 'public', 'private']);
export const scoreBucketSchema = z.enum(['all', 'high', 'medium', 'low']);
export const freshnessBucketSchema = z.enum(['all', 'week', 'month', 'year']);
export const popularityBucketSchema = z.enum(['all', 'popular', 'growing', 'new']);

export type SortOption = z.infer<typeof sortOptionSchema>;
export type VisibilityFilter = z.infer<typeof visibilityFilterSchema>;
export type ScoreBucket = z.infer<typeof scoreBucketSchema>;
export type FreshnessBucket = z.infer<typeof freshnessBucketSchema>;
export type PopularityBucket = z.infer<typeof popularityBucketSchema>;

export const skillsSearchSchema = z
  .object({
    q: z.string().catch('').default(''),
    page: z.coerce.number().min(1).catch(1).default(1),
    sort: sortOptionSchema.catch('updated').default('updated'),
    visibility: visibilityFilterSchema.catch('all').default('all'),
    score: scoreBucketSchema.catch('all').default('all'),
    freshness: freshnessBucketSchema.catch('all').default('all'),
    popularity: popularityBucketSchema.catch('all').default('all'),
    docs: z
      .preprocess((v) => v === '1' || v === true, z.boolean())
      .catch(false)
      .default(false)
  })
  .transform(({ score, docs, ...rest }) => ({
    ...rest,
    scoreBucket: score,
    hasReadme: docs
  }));

export interface SkillsSearchParams {
  q: string;
  page: number;
  limit: number;
  sort: SortOption;
  visibility: VisibilityFilter;
  scoreBucket: ScoreBucket;
  freshness?: FreshnessBucket;
  popularity?: PopularityBucket;
  hasReadme?: boolean;
  requesterUserId?: string | null;
}
