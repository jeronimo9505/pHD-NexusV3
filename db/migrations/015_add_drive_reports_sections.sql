-- Migration: Add sections column for draft content
-- Adds JSONB column to store draft report sections

-- Add sections field to store draft content
ALTER TABLE drive_reports 
ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN drive_reports.sections IS 'JSON object containing draft sections: context, experimental, findings, difficulties, nextSteps';

-- Create GIN index for JSONB queries (optional, for better performance)
CREATE INDEX IF NOT EXISTS idx_drive_reports_sections ON drive_reports USING GIN (sections);
