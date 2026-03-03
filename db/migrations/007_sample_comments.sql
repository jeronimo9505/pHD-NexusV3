-- Migration: Add Sample Comments
CREATE TABLE IF NOT EXISTS sample_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sample_id UUID NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE sample_comments ENABLE ROW LEVEL SECURITY;

-- Policies (reusing group logic via sample->group linkage would be ideal, but samples table has group_id? Let's check samples table schema)
-- Samples table has group_id.

CREATE POLICY "Users can view comments for samples in their group" ON sample_comments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM samples s
            JOIN group_members gm ON gm.group_id = s.group_id
            WHERE s.id = sample_comments.sample_id
            AND gm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert comments for samples in their group" ON sample_comments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM samples s
            JOIN group_members gm ON gm.group_id = s.group_id
            WHERE s.id = sample_comments.sample_id
            AND gm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own comments" ON sample_comments
    FOR DELETE USING (
        author_id = auth.uid()
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sample_comments_sample_id ON sample_comments(sample_id);
CREATE INDEX IF NOT EXISTS idx_sample_comments_author_id ON sample_comments(author_id);

-- Trigger for updated_at
CREATE TRIGGER update_sample_comments_updated_at BEFORE UPDATE ON sample_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
