-- Add completed column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;

-- Add index for faster queries on completed tasks
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
