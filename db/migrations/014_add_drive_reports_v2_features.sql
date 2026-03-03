-- Migration: Add Drive Reports V2 features
-- Adds type, status, importance, and period fields to drive_reports table

-- Add type field (report, ppt, meeting_note)
ALTER TABLE drive_reports 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'report';

-- Add is_important field for star/favorite functionality
ALTER TABLE drive_reports 
ADD COLUMN IF NOT EXISTS is_important BOOLEAN DEFAULT FALSE;

-- Add status field (draft, pending, approved, rejected)
ALTER TABLE drive_reports 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- Add start_date for period reports
ALTER TABLE drive_reports 
ADD COLUMN IF NOT EXISTS start_date TIMESTAMP;

-- Add end_date for period reports
ALTER TABLE drive_reports 
ADD COLUMN IF NOT EXISTS end_date TIMESTAMP;

-- Add author_name for display (denormalized for performance)
ALTER TABLE drive_reports 
ADD COLUMN IF NOT EXISTS author_name TEXT;

-- Add comments
COMMENT ON COLUMN drive_reports.type IS 'Type of report: report, ppt, or meeting_note';
COMMENT ON COLUMN drive_reports.is_important IS 'Whether the report is marked as important/starred';
COMMENT ON COLUMN drive_reports.status IS 'Report status: draft, pending, approved, or rejected';
COMMENT ON COLUMN drive_reports.start_date IS 'Start date for period reports';
COMMENT ON COLUMN drive_reports.end_date IS 'End date for period reports';
COMMENT ON COLUMN drive_reports.author_name IS 'Cached author name for display';

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_drive_reports_type ON drive_reports(type);
CREATE INDEX IF NOT EXISTS idx_drive_reports_status ON drive_reports(status);
CREATE INDEX IF NOT EXISTS idx_drive_reports_start_date ON drive_reports(start_date);
CREATE INDEX IF NOT EXISTS idx_drive_reports_is_important ON drive_reports(is_important);
