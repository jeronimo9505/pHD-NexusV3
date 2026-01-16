-- Add is_pinned to knowledge_items
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

-- Add url column if it doesn't exist (verified it exists in live DB but good for schema consistency)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='knowledge_items' AND column_name='url') THEN
        ALTER TABLE knowledge_items ADD COLUMN url TEXT DEFAULT '';
    END IF;
END $$;

-- Create knowledge_comments table
CREATE TABLE IF NOT EXISTS knowledge_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_knowledge_comments_item_id ON knowledge_comments(item_id);
