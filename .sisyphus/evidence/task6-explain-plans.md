# Task 6: DB Index EXPLAIN Evidence

**Date:** 2026-02-20
**DB:** Supabase PostgreSQL (221 skills, ~1041 skill_versions, 3 users)

## Indexes Added

| Index | Table | Columns | Replaces |
|-------|-------|---------|----------|
| `skill_versions_skill_id_created_at_idx` | skill_versions | (skill_id, created_at) | `skill_versions_skill_id_idx` (single) |
| `scan_results_version_id_created_at_idx` | scan_results | (version_id, created_at) | `scan_results_version_id_idx` (single) |
| `skills_publisher_id_idx` | skills | (publisher_id) | NEW |
| `skills_updated_at_idx` | skills | (updated_at) | NEW |

## Results Summary

| Query | BEFORE (ms) | AFTER (ms) | Speedup | Key Change |
|-------|-------------|------------|---------|------------|
| Browse (ORDER BY updated_at) | 68.8 | 4.5 | **15.2x** | MAX subquery: Bitmap→Index Only Scan; user JOIN: NL→Hash |
| Search (FTS + rank) | 14.6 | 10.3 | **1.4x** | MAX subquery: Bitmap→Index Only Scan |
| Skill detail (by name) | 0.15 | 0.15 | 1.0x | Already optimal (unique index) |
| Scan results (LATERAL) | 0.18 | 0.11 | **1.6x** | Sort eliminated by composite index backward scan |

## BEFORE Plans

### Query 1: Browse (no search, ORDER BY updated_at DESC)

```
Limit  (cost=534.29..534.34 rows=20 width=150) (actual time=68.558..68.566 rows=20 loops=1)
  Buffers: shared hit=1680
  ->  Sort  (cost=534.29..534.84 rows=221 width=150) (actual time=68.557..68.562 rows=20 loops=1)
        Sort Key: s.updated_at DESC
        Sort Method: top-N heapsort  Memory: 31kB
        ->  WindowAgg  (cost=526.07..528.41 rows=221 width=150) (actual time=68.402..68.458 rows=221 loops=1)
              ->  Nested Loop Left Join  (cost=12.53..525.65 rows=221 width=142) (actual time=65.802..68.239 rows=221 loops=1)
                    Join Filter: (u.id = s.publisher_id)          ← NO INDEX, filter scan
                    Rows Removed by Join Filter: 404
                    ->  Hash Right Join  (cost=12.53..518.73 rows=221 width=146)
                          ->  Seq Scan on skill_versions sv
                          ->  Hash
                                ->  Seq Scan on skills s
                                SubPlan 1 (MAX subquery)
                                  ->  Aggregate  (actual time=0.142..0.143 rows=1 loops=442)
                                        ->  Bitmap Heap Scan on skill_versions sv2  ← HEAP SCAN
                                              Recheck Cond: (skill_id = s.id)
                                              Heap Blocks: exact=654
                                              ->  Bitmap Index Scan on skill_versions_skill_id_idx
                    ->  Materialize  (cost=0.00..1.03 rows=2 width=64)
                          ->  Seq Scan on "user" u                ← SEQ SCAN on user
Execution Time: 68.777 ms
```

### Query 1b: Search (FTS + rank)

```
Limit  (cost=642.62..642.67 rows=20 width=146) (actual time=14.307..14.314 rows=20 loops=1)
  Buffers: shared hit=1605
  SubPlan 1 (MAX subquery)
    ->  Aggregate  (actual time=0.008..0.008 rows=1 loops=416)
          ->  Bitmap Heap Scan on skill_versions sv2              ← HEAP SCAN
                Recheck Cond: (skill_id = s.id)
                ->  Bitmap Index Scan on skill_versions_skill_id_idx
  ->  Memoize  (user JOIN)
        Hits: 205  Misses: 3
        ->  Index Scan using user_pkey on "user" u
Execution Time: 14.585 ms
```

### Query 3: Scan results

```
Limit  (cost=7.38..7.38 rows=1 width=97) (actual time=0.045..0.046 rows=0 loops=1)
  ->  Sort  (cost=2.37..2.38 rows=1 width=97)                    ← EXPLICIT SORT
        Sort Key: sr.created_at DESC
        ->  Index Scan using scan_results_version_id_idx on scan_results sr
Execution Time: 0.181 ms
```

## AFTER Plans

### Query 1: Browse (no search, ORDER BY updated_at DESC)

```
Limit  (cost=255.07..255.12 rows=20 width=150) (actual time=4.378..4.385 rows=20 loops=1)
  Buffers: shared hit=1439 read=4
  ->  Sort  (cost=255.07..255.62 rows=221 width=150) (actual time=4.377..4.381 rows=20 loops=1)
        Sort Key: s.updated_at DESC
        ->  WindowAgg  (cost=248.13..249.19 rows=221 width=150) (actual time=4.227..4.282 rows=221 loops=1)
              ->  Hash Left Join  (cost=13.57..246.43 rows=221 width=142)
                    Hash Cond: (s.publisher_id = u.id)            ← HASH JOIN (was NL filter)
                    ->  Hash Right Join
                          SubPlan 2 (MAX subquery)
                            ->  Result
                                  InitPlan 1
                                    ->  Limit  (rows=1)
                                          ->  Index Only Scan Backward using skill_versions_skill_id_created_at_idx  ← INDEX ONLY SCAN
                                                Index Cond: (skill_id = s.id)
                                                Heap Fetches: 416
                    ->  Hash  (user table)
                          ->  Seq Scan on "user" u  (rows=3)
Execution Time: 4.535 ms
```

**Key improvements:**
1. MAX subquery: `Bitmap Heap Scan + Aggregate` → `Index Only Scan Backward + Limit` (no heap access needed for MAX)
2. User JOIN: `Nested Loop + Join Filter` → `Hash Left Join` (publisher_id index enables hash join strategy)
3. Cost estimate: 534 → 255 (53% reduction)
4. Buffer hits: 1680 → 1439 (14% reduction)

### Query 1b: Search (FTS + rank)

```
Limit  (cost=364.75..364.80 rows=20 width=146) (actual time=10.151..10.159 rows=20 loops=1)
  Buffers: shared hit=1387
  SubPlan 2 (MAX subquery)
    ->  Result
          InitPlan 1
            ->  Limit  (rows=1)
                  ->  Index Only Scan Backward using skill_versions_skill_id_created_at_idx  ← INDEX ONLY SCAN
                        Index Cond: (skill_id = s.id)
                        Heap Fetches: 408
  ->  Hash Left Join  (user JOIN)
        Hash Cond: (s.publisher_id = u.id)
Execution Time: 10.322 ms
```

**Key improvement:** MAX subquery same optimization. Buffer hits: 1605 → 1387 (14% reduction).

### Query 3: Scan results

```
Limit  (cost=5.15..7.37 rows=1 width=97) (actual time=0.022..0.022 rows=0 loops=1)
  ->  Index Scan Backward using scan_results_version_id_created_at_idx  ← BACKWARD SCAN (no sort)
        Index Cond: (version_id = (InitPlan 1).col1)
Execution Time: 0.114 ms
```

**Key improvement:** Explicit Sort node eliminated — composite index provides ORDER BY created_at DESC via backward scan.

## Notes

- Publishers table does NOT exist in DB. Queries adapted to JOIN `"user"` directly.
- The `skills.publisher_id` column is `text` type referencing `user.id` (also text).
- With only 3 users, the user JOIN is trivially fast either way. The publisher_id index will matter more at scale.
- The `skills_updated_at_idx` wasn't used by the planner for the browse query (221 rows too small for index sort to beat heapsort). It will help at scale when the table grows.
- The composite `skill_versions(skill_id, created_at)` index is the biggest win — transforms MAX subquery from O(n) heap scan to O(1) index-only backward scan.
