-- ============================================================================
-- FIX updated_at TRIGGER ERROR
-- Error: record "new" has no field "updated_at"
-- Solution: Drop and recreate trigger correctly
-- ============================================================================

-- The trigger function tries to set NEW.updated_at but fails
-- We need to ensure the trigger is using the correct approach

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS set_updated_at ON drive_reports;

-- Ensure updated_at column exists (it should from 003_missing_tables.sql)
-- This is a safety check
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'drive_reports' 
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE drive_reports 
        ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
        RAISE NOTICE 'Column updated_at added to drive_reports';
    ELSE
        RAISE NOTICE 'Column updated_at already exists';
    END IF;
END $$;

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON drive_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Verify
SELECT 
    trigger_name, 
    event_manipulation, 
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'drive_reports';
