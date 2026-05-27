-- ============================================================================
-- FINAL FIX FOR DRIVE REPORTS DELETION
-- Issue: Multiple conflicting RLS policies blocking deletion
-- Root Cause: Old restrictive policy from 20260122_fix_security.sql
-- ============================================================================

-- 1. Clean slate: Remove ALL existing delete policies on drive_reports
DROP POLICY IF EXISTS "Authors delete drive reports" ON drive_reports;
DROP POLICY IF EXISTS "Enable delete for authors" ON drive_reports;
DROP POLICY IF EXISTS "Enable delete for group members" ON drive_reports;
DROP POLICY IF EXISTS "Enable delete for authenticated" ON drive_reports;

-- 2. Create ONE comprehensive delete policy
-- Allow deletion if user is a member of the group (covers all cases)
CREATE POLICY "Group members can delete drive reports" ON drive_reports
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = drive_reports.group_id
            AND group_members.user_id = auth.uid()
        )
    );

-- 3. Ensure related tables don't block CASCADE deletes
-- These tables should allow deletes if you can delete the parent

-- drive_report_comments
ALTER TABLE drive_report_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Group members delete drive report comments" ON drive_report_comments;
CREATE POLICY "Group members delete drive report comments" ON drive_report_comments
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM drive_reports
            JOIN group_members ON drive_reports.group_id = group_members.group_id
            WHERE drive_report_comments.drive_report_id = drive_reports.id
            AND group_members.user_id = auth.uid()
        )
    );

-- drive_report_task_links
ALTER TABLE drive_report_task_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Group members delete drive report task links" ON drive_report_task_links;
CREATE POLICY "Group members delete drive report task links" ON drive_report_task_links
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM drive_reports
            JOIN group_members ON drive_reports.group_id = group_members.group_id
            WHERE drive_report_task_links.drive_report_id = drive_reports.id
            AND group_members.user_id = auth.uid()
        )
    );

-- drive_report_views
ALTER TABLE drive_report_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Group members delete drive report views" ON drive_report_views;
CREATE POLICY "Group members delete drive report views" ON drive_report_views
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM drive_reports
            JOIN group_members ON drive_reports.group_id = group_members.group_id
            WHERE drive_report_views.drive_report_id = drive_reports.id
            AND group_members.user_id = auth.uid()
        )
    );

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running this, test with:
-- 1. Log into your app as a group member
-- 2. Try to delete a drive report
-- 3. It should work regardless of who created it (as long as you're in the group)
