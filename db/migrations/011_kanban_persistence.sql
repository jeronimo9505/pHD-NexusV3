-- ============================================================================
-- Kanban Persistence
-- Created: 2026-02-04
-- Purpose: Persist Kanban columns in groups table and allow dynamic task statuses
-- ============================================================================

-- 1. Add kanban_columns to groups
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS kanban_columns JSONB DEFAULT '["todo", "in_progress", "done"]'::jsonb;

-- 2. Drop strict status check on tasks to allow custom statuses (columns)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

-- 3. (Optional) We could add a trigger to validate status exists in group's columns, 
-- but for flexibility we'll allow any string for now.
