-- ============================================================================
-- Security Fixes - Consolidated Migration
-- Applied on: 2026-01-22
-- Includes: RLS Enablement, Core Policies, Drive Policies, Function Security
-- ============================================================================

-- 1. Enable RLS on ALL identified tables
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS report_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS report_task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS report_knowledge_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activity_log ENABLE ROW LEVEL SECURITY;

-- Drive tables (from error logs)
ALTER TABLE IF EXISTS drive_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS drive_report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS drive_report_task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS report_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_comments ENABLE ROW LEVEL SECURITY;

-- 2. Secure Functions ("Function Search Path Mutable")
ALTER FUNCTION update_updated_at_column() SET search_path = public;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') THEN
        ALTER FUNCTION handle_new_user() SET search_path = public;
    END IF;
END $$;

-- ============================================================================
-- POLICIES (Idempotent: Drop first to avoid conflicts)
-- ============================================================================

-- PROFILES
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- GROUPS
DROP POLICY IF EXISTS "Groups are viewable by authenticated users" ON groups;
CREATE POLICY "Groups are viewable by authenticated users" ON groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can create groups" ON groups;
CREATE POLICY "Authenticated users can create groups" ON groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Owners can update their groups" ON groups;
CREATE POLICY "Owners can update their groups" ON groups FOR UPDATE USING (auth.uid() = created_by);

-- Remove insecure testing policy if it exists
DROP POLICY IF EXISTS "Allow all updates for testing" ON groups;

-- GROUP MEMBERS
DROP POLICY IF EXISTS "Group members are viewable by authenticated users" ON group_members;
CREATE POLICY "Group members are viewable by authenticated users" ON group_members FOR SELECT TO authenticated USING (true);

-- REPORTS
DROP POLICY IF EXISTS "Group members can view reports" ON reports;
CREATE POLICY "Group members can view reports" ON reports FOR SELECT USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_members.group_id = reports.group_id AND group_members.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Authors can create reports" ON reports;
CREATE POLICY "Authors can create reports" ON reports FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors and Supervisors can update reports" ON reports;
CREATE POLICY "Authors and Supervisors can update reports" ON reports FOR UPDATE USING (auth.uid() = author_id OR auth.uid() = reviewed_by);

-- REPORT SECTIONS
DROP POLICY IF EXISTS "View report sections if have access to report" ON report_sections;
CREATE POLICY "View report sections if have access to report" ON report_sections FOR SELECT USING (
    EXISTS (SELECT 1 FROM reports JOIN group_members ON reports.group_id = group_members.group_id WHERE reports.id = report_sections.report_id AND group_members.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM reports WHERE reports.id = report_sections.report_id AND reports.author_id = auth.uid())
);

DROP POLICY IF EXISTS "Authors can maintain report sections" ON report_sections;
CREATE POLICY "Authors can maintain report sections" ON report_sections FOR ALL USING (
    EXISTS (SELECT 1 FROM reports WHERE reports.id = report_sections.report_id AND reports.author_id = auth.uid())
);

-- TASKS
DROP POLICY IF EXISTS "Group members can view tasks" ON tasks;
CREATE POLICY "Group members can view tasks" ON tasks FOR SELECT USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_members.group_id = tasks.group_id AND group_members.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Group members can create tasks" ON tasks;
CREATE POLICY "Group members can create tasks" ON tasks FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM group_members WHERE group_members.group_id = tasks.group_id AND group_members.user_id = auth.uid())
);

-- KNOWLEDGE
DROP POLICY IF EXISTS "Group members can view knowledge" ON knowledge_items;
CREATE POLICY "Group members can view knowledge" ON knowledge_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_members.group_id = knowledge_items.group_id AND group_members.user_id = auth.uid())
);

-- ACTIVITY LOG
DROP POLICY IF EXISTS "Users view activity for their groups" ON activity_log;
CREATE POLICY "Users view activity for their groups" ON activity_log FOR SELECT USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_members.group_id = activity_log.group_id AND group_members.user_id = auth.uid())
);

-- ============================================================================
-- DRIVE / EXTRA TABLES POLICIES
-- ============================================================================

-- Drive Reports
DROP POLICY IF EXISTS "Group members view drive reports" ON drive_reports;
CREATE POLICY "Group members view drive reports" ON drive_reports FOR SELECT USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_members.group_id = drive_reports.group_id AND group_members.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Authors create drive reports" ON drive_reports;
CREATE POLICY "Authors create drive reports" ON drive_reports FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Drive Report Comments
DROP POLICY IF EXISTS "Group members view drive comments" ON drive_report_comments;
CREATE POLICY "Group members view drive comments" ON drive_report_comments FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM drive_reports 
        JOIN group_members ON drive_reports.group_id = group_members.group_id 
        WHERE drive_report_comments.drive_report_id = drive_reports.id 
        AND group_members.user_id = auth.uid()
    )
);

-- Report Views
DROP POLICY IF EXISTS "Users can track views" ON report_views;
CREATE POLICY "Users can track views" ON report_views FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own view stats" ON report_views;
CREATE POLICY "Users view own view stats" ON report_views FOR SELECT USING (auth.uid() = user_id);

-- Knowledge Comments
DROP POLICY IF EXISTS "Group members view knowledge comments" ON knowledge_comments;
CREATE POLICY "Group members view knowledge comments" ON knowledge_comments FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM knowledge_items 
        JOIN group_members ON knowledge_items.group_id = group_members.group_id 
        WHERE knowledge_comments.item_id = knowledge_items.id 
        AND group_members.user_id = auth.uid()
    )
);
