-- ============================================================================
-- Add Subtasks Column
-- Created: 2026-02-04
-- Purpose: Add support for subtasks in tasks table
-- ============================================================================

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='subtasks') THEN
        ALTER TABLE tasks ADD COLUMN subtasks JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;
