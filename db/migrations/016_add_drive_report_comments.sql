-- Migration: Add Drive Report Comments
-- Description: Adds a table for comments on drive reports with RLS policies

CREATE TABLE IF NOT EXISTS drive_report_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES drive_reports(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE drive_report_comments ENABLE ROW LEVEL SECURITY;

-- Policies

-- 1. View comments: Users can view comments if they can view the report (same group)
CREATE POLICY "Users can view comments for reports in their group" ON drive_report_comments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM drive_reports dr
            JOIN group_members gm ON gm.group_id = dr.group_id
            WHERE dr.id = drive_report_comments.report_id
            AND gm.user_id = auth.uid()
        )
    );

-- 2. Insert comments: Users can comment if they are in the group
CREATE POLICY "Users can insert comments for reports in their group" ON drive_report_comments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM drive_reports dr
            JOIN group_members gm ON gm.group_id = dr.group_id
            WHERE dr.id = drive_report_comments.report_id
            AND gm.user_id = auth.uid()
        )
    );

-- 3. Delete comments: Users can delete their own comments
CREATE POLICY "Users can delete their own comments" ON drive_report_comments
    FOR DELETE USING (
        author_id = auth.uid()
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drive_report_comments_report_id ON drive_report_comments(report_id);
CREATE INDEX IF NOT EXISTS idx_drive_report_comments_author_id ON drive_report_comments(author_id);

-- Add comments trigger for updated_at
CREATE TRIGGER update_drive_report_comments_updated_at BEFORE UPDATE ON drive_report_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
