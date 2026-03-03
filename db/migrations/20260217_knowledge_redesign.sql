-- Knowledge Base Redesign Migration
-- Relax category constraint, add is_starred, resource_type, folder_id

-- 1. Drop the existing CHECK constraint on category
ALTER TABLE knowledge_items DROP CONSTRAINT IF EXISTS knowledge_items_category_check;

-- 2. Add new columns
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT FALSE;
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS resource_type TEXT DEFAULT 'file';
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS folder_id TEXT;

-- 3. Make content nullable (manual links/resources may not have content body)
ALTER TABLE knowledge_items ALTER COLUMN content DROP NOT NULL;
ALTER TABLE knowledge_items ALTER COLUMN content SET DEFAULT '';

-- 4. Make category nullable more flexible (remove NOT NULL if desired, or set default)
ALTER TABLE knowledge_items ALTER COLUMN category DROP NOT NULL;
ALTER TABLE knowledge_items ALTER COLUMN category SET DEFAULT 'General';

-- 5. Index for starred items
CREATE INDEX IF NOT EXISTS idx_knowledge_starred ON knowledge_items(is_starred);
CREATE INDEX IF NOT EXISTS idx_knowledge_folder ON knowledge_items(folder_id);
