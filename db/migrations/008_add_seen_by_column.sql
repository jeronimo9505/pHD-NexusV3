-- ============================================================================
-- ADD MISSING seen_by COLUMN TO drive_reports
-- Root Cause: Original schema (003_missing_tables.sql) didn't include seen_by
-- This column is required for mark-as-seen functionality
-- ============================================================================

-- Add seen_by column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'drive_reports' 
          AND column_name = 'seen_by'
    ) THEN
        ALTER TABLE drive_reports 
        ADD COLUMN seen_by TEXT[] DEFAULT '{}';
        
        RAISE NOTICE 'Column seen_by added to drive_reports';
    ELSE
        RAISE NOTICE 'Column seen_by already exists';
    END IF;
END $$;

-- Create index for performance (querying by seen_by)
CREATE INDEX IF NOT EXISTS idx_drive_reports_seen_by 
ON drive_reports USING GIN (seen_by);

-- Add RLS policy to allow users to update seen_by
DROP POLICY IF EXISTS "Users can update seen_by" ON drive_reports;
CREATE POLICY "Users can update seen_by" ON drive_reports
    FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = drive_reports.group_id
            AND group_members.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = drive_reports.group_id
            AND group_members.user_id = auth.uid()
        )
    );

-- Verification: Show first 5 records with seen_by
SELECT id, title, seen_by
FROM drive_reports
LIMIT 5;
