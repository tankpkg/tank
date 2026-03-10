-- Add llm_analysis column to scan_results table
ALTER TABLE scan_results ADD COLUMN llm_analysis jsonb;
