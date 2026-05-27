-- Enable RLS
ALTER TABLE drive_reports ENABLE ROW LEVEL SECURITY;

-- Policy to allow viewing (Select)
CREATE POLICY "Enable read access for all users" ON drive_reports
    FOR SELECT USING (true); -- Simplify for debugging, refine later to group_members

-- Policy to allow inserting (Insert)
CREATE POLICY "Enable insert for authenticated users" ON drive_reports
    FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Policy to allow updating (Update)
CREATE POLICY "Enable update for users based on id" ON drive_reports
    FOR UPDATE USING (auth.uid() = author_id);

-- Policy to allow deleting (Delete) -- CRITICAL FIX
DROP POLICY IF EXISTS "Enable delete for authors" ON drive_reports;
CREATE POLICY "Enable delete for authors" ON drive_reports
    FOR DELETE USING (auth.uid() = author_id);

-- OR safer wide policy for debugging if author_id is messed up
CREATE POLICY "Enable delete for group members" ON drive_reports
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = drive_reports.group_id
            AND group_members.user_id = auth.uid()
        )
    );
