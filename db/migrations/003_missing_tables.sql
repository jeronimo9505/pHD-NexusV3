-- ============================================================================
-- Missing Tables Migration
-- Created: 2026-01-26
-- Purpose: Add all tables that are referenced in code but missing from schema
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- DRIVE REPORTS MODULE TABLES
-- ============================================================================

-- Drive Reports (Google Drive-based reports)
CREATE TABLE IF NOT EXISTS drive_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    author_name TEXT,
    title TEXT NOT NULL,
    name TEXT, -- Alias for title (legacy compatibility)
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'submitted', 'reviewed')),
    type TEXT NOT NULL DEFAULT 'report' CHECK (type IN ('report', 'ppt', 'meeting_note')),
    drive_file_id TEXT, -- Google Drive file ID
    web_view_link TEXT, -- Google Drive web view link
    icon_link TEXT, -- Google Drive icon link
    mime_type TEXT, -- MIME type of the file
    sections JSONB DEFAULT '{}', -- Report sections as JSON
    is_important BOOLEAN NOT NULL DEFAULT FALSE,
    start_date DATE,
    end_date DATE,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drive Report Comments
CREATE TABLE IF NOT EXISTS drive_report_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drive_report_id UUID NOT NULL REFERENCES drive_reports(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drive Report Task Links (link tasks to drive reports)
CREATE TABLE IF NOT EXISTS drive_report_task_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drive_report_id UUID NOT NULL REFERENCES drive_reports(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(drive_report_id, task_id)
);

-- Drive Report Views (track who viewed drive reports)
CREATE TABLE IF NOT EXISTS drive_report_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drive_report_id UUID NOT NULL REFERENCES drive_reports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(drive_report_id, user_id)
);

-- ============================================================================
-- STANDARD REPORTS MODULE TABLES
-- ============================================================================

-- Report Views (track who viewed standard reports)
CREATE TABLE IF NOT EXISTS report_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(report_id, user_id)
);

-- ============================================================================
-- ANNOUNCEMENTS MODULE TABLES
-- ============================================================================

-- Announcements (group-wide announcements)
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Announcement Comments
CREATE TABLE IF NOT EXISTS announcement_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- RBAC TABLES (Referenced in AuthContext but missing)
-- ============================================================================

-- Roles (predefined roles for RBAC)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL CHECK (name IN ('admin', 'supervisor', 'researcher', 'student', 'labmanager', 'owner')),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permissions (predefined permissions)
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role Permissions (many-to-many relationship)
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(role, permission_id)
);

-- ============================================================================
-- GROUPS ENHANCEMENTS
-- ============================================================================

-- Add drive_settings column to groups table if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='groups' AND column_name='drive_settings') THEN
        ALTER TABLE groups ADD COLUMN drive_settings JSONB DEFAULT '{}';
    END IF;
END $$;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Drive Reports
CREATE INDEX IF NOT EXISTS idx_drive_reports_group_id ON drive_reports(group_id);
CREATE INDEX IF NOT EXISTS idx_drive_reports_author_id ON drive_reports(author_id);
CREATE INDEX IF NOT EXISTS idx_drive_reports_status ON drive_reports(status);
CREATE INDEX IF NOT EXISTS idx_drive_reports_type ON drive_reports(type);
CREATE INDEX IF NOT EXISTS idx_drive_reports_created_at ON drive_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_drive_reports_drive_file_id ON drive_reports(drive_file_id);

-- Drive Report Comments
CREATE INDEX IF NOT EXISTS idx_drive_report_comments_drive_report_id ON drive_report_comments(drive_report_id);
CREATE INDEX IF NOT EXISTS idx_drive_report_comments_author_id ON drive_report_comments(author_id);

-- Drive Report Task Links
CREATE INDEX IF NOT EXISTS idx_drive_report_task_links_drive_report_id ON drive_report_task_links(drive_report_id);
CREATE INDEX IF NOT EXISTS idx_drive_report_task_links_task_id ON drive_report_task_links(task_id);

-- Drive Report Views
CREATE INDEX IF NOT EXISTS idx_drive_report_views_drive_report_id ON drive_report_views(drive_report_id);
CREATE INDEX IF NOT EXISTS idx_drive_report_views_user_id ON drive_report_views(user_id);

-- Report Views
CREATE INDEX IF NOT EXISTS idx_report_views_report_id ON report_views(report_id);
CREATE INDEX IF NOT EXISTS idx_report_views_user_id ON report_views(user_id);

-- Announcements
CREATE INDEX IF NOT EXISTS idx_announcements_group_id ON announcements(group_id);
CREATE INDEX IF NOT EXISTS idx_announcements_author_id ON announcements(author_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at);

-- Announcement Comments
CREATE INDEX IF NOT EXISTS idx_announcement_comments_announcement_id ON announcement_comments(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_comments_user_id ON announcement_comments(user_id);

-- Role Permissions
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp for drive_reports
CREATE TRIGGER update_drive_reports_updated_at BEFORE UPDATE ON drive_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at timestamp for announcements
CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE drive_reports IS 'Google Drive-based reports (Docs, PPTs, Meeting Notes)';
COMMENT ON TABLE drive_report_comments IS 'Comments on drive reports';
COMMENT ON TABLE drive_report_task_links IS 'Links between drive reports and tasks';
COMMENT ON TABLE drive_report_views IS 'Track who has viewed each drive report';
COMMENT ON TABLE report_views IS 'Track who has viewed each standard report';
COMMENT ON TABLE announcements IS 'Group-wide announcements';
COMMENT ON TABLE announcement_comments IS 'Comments on announcements';
COMMENT ON TABLE roles IS 'Predefined roles for RBAC';
COMMENT ON TABLE permissions IS 'Predefined permissions for RBAC';
COMMENT ON TABLE role_permissions IS 'Many-to-many relationship between roles and permissions';

-- ============================================================================
-- SEED DEFAULT ROLES (Optional - can be moved to seeds)
-- ============================================================================

INSERT INTO roles (name, description) VALUES
    ('admin', 'System administrator with full access'),
    ('supervisor', 'Group supervisor with elevated permissions'),
    ('researcher', 'Researcher with standard permissions'),
    ('student', 'Student with basic permissions'),
    ('labmanager', 'Lab manager with administrative permissions'),
    ('owner', 'Group owner with full group control')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
