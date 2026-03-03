-- Migration: Add previous_status column to tasks table
-- This allows tasks to remember their original column when marked as done

ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- Add comment for documentation
COMMENT ON COLUMN tasks.previous_status IS 'Stores the previous status before marking task as done, allowing restoration to original column';
