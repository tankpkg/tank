-- Add LLM analysis fields to scan_findings table
ALTER TABLE scan_findings ADD COLUMN llm_verdict text;
ALTER TABLE scan_findings ADD COLUMN llm_reviewed boolean DEFAULT false;
