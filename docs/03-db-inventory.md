# PHASE 1: Database Inventory

**Date**: 2026-01-26  
**Status**: Complete Schema Analysis

---

## Overview

This document provides a complete inventory of the database schema for pHD-NexusV2, including:
- All tables (existing and previously missing)
- Relationships and foreign keys
- RLS policies
- Functions and triggers
- Indexes

---

## Complete Table List

### Core Tables (Defined in `schema.sql`)

| Table Name | Purpose | Key Columns | Status |
|------------|---------|-------------|--------|
| `profiles` | User profiles and authentication data | id, email, full_name, system_role, status | ✅ Exists |
| `groups` | Research groups/labs | id, name, code, created_by, drive_settings | ✅ Exists |
| `group_members` | Group membership with roles | id, group_id, user_id, role, status | ✅ Exists |
| `reports` | Weekly scientific reports | id, group_id, author_id, week_start, week_end, status | ✅ Exists |
| `report_sections` | Report content sections | report_id, key, content | ✅ Exists |
| `report_comments` | Comments on reports | id, report_id, author_id, body | ✅ Exists |
| `tasks` | Task management | id, group_id, title, status, priority, due_date | ✅ Exists |
| `task_assignees` | Task assignments | task_id, user_id | ✅ Exists |
| `task_comments` | Comments on tasks | id, task_id, author_id, body | ✅ Exists |
| `knowledge_items` | Knowledge base items | id, group_id, title, content, category, tags | ✅ Exists |
| `report_task_links` | Links between reports and tasks | report_id, task_id | ✅ Exists |
| `report_knowledge_links` | Links between reports and knowledge | report_id, item_id | ✅ Exists |
| `activity_log` | Audit trail of user actions | id, group_id, user_id, action, entity_type | ✅ Exists |

### Knowledge Module Tables (Added in `002_knowledge_enhancements.sql`)

| Table Name | Purpose | Key Columns | Status |
|------------|---------|-------------|--------|
| `knowledge_comments` | Comments on knowledge items | id, item_id, author_id, text | ✅ Exists |

### Drive Reports Module Tables (MISSING - Added in `003_missing_tables.sql`)

| Table Name | Purpose | Key Columns | Status |
|------------|---------|-------------|--------|
| `drive_reports` | Google Drive-based reports | id, group_id, author_id, drive_file_id, web_view_link, type, status | ❌ **WAS MISSING** |
| `drive_report_comments` | Comments on drive reports | id, drive_report_id, author_id, body | ❌ **WAS MISSING** |
| `drive_report_task_links` | Links between drive reports and tasks | drive_report_id, task_id | ❌ **WAS MISSING** |
| `drive_report_views` | Track who viewed drive reports | drive_report_id, user_id, viewed_at | ❌ **WAS MISSING** |

### Standard Reports Module Tables (MISSING - Added in `003_missing_tables.sql`)

| Table Name | Purpose | Key Columns | Status |
|------------|---------|-------------|--------|
| `report_views` | Track who viewed standard reports | report_id, user_id, seen_at | ❌ **WAS MISSING** |

### Announcements Module Tables (MISSING - Added in `003_missing_tables.sql`)

| Table Name | Purpose | Key Columns | Status |
|------------|---------|-------------|--------|
| `announcements` | Group-wide announcements | id, group_id, author_id, content | ❌ **WAS MISSING** |
| `announcement_comments` | Comments on announcements | id, announcement_id, user_id, content | ❌ **WAS MISSING** |

### RBAC Tables (MISSING - Added in `003_missing_tables.sql`)

| Table Name | Purpose | Key Columns | Status |
|------------|---------|-------------|--------|
| `roles` | Predefined roles | id, name, description | ❌ **WAS MISSING** |
| `permissions` | Predefined permissions | id, code, description | ❌ **WAS MISSING** |
| `role_permissions` | Role-permission mappings | role, permission_id | ❌ **WAS MISSING** |

---

## Table Relationships

### Entity Relationship Diagram (Textual)

```
profiles (users)
    ├─→ groups (created_by)
    ├─→ group_members (user_id)
    ├─→ reports (author_id, reviewed_by)
    ├─→ drive_reports (author_id)
    ├─→ tasks (created_by)
    ├─→ knowledge_items (created_by)
    ├─→ announcements (author_id)
    └─→ various comments tables (author_id)

groups
    ├─→ group_members (group_id)
    ├─→ reports (group_id)
    ├─→ drive_reports (group_id)
    ├─→ tasks (group_id)
    ├─→ knowledge_items (group_id)
    ├─→ announcements (group_id)
    └─→ activity_log (group_id)

reports
    ├─→ report_sections (report_id)
    ├─→ report_comments (report_id)
    ├─→ report_views (report_id)
    ├─→ report_task_links (report_id)
    └─→ report_knowledge_links (report_id)

drive_reports
    ├─→ drive_report_comments (drive_report_id)
    ├─→ drive_report_task_links (drive_report_id)
    └─→ drive_report_views (drive_report_id)

tasks
    ├─→ task_assignees (task_id)
    ├─→ task_comments (task_id)
    ├─→ report_task_links (task_id)
    └─→ drive_report_task_links (task_id)

knowledge_items
    ├─→ knowledge_comments (item_id)
    └─→ report_knowledge_links (item_id)

announcements
    └─→ announcement_comments (announcement_id)

roles
    └─→ role_permissions (role)

permissions
    └─→ role_permissions (permission_id)
```

---

## Detailed Table Schemas

### `drive_reports` (CRITICAL - Was Missing)

```sql
CREATE TABLE drive_reports (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    author_name TEXT,
    title TEXT NOT NULL,
    name TEXT, -- Alias for title
    status TEXT NOT NULL DEFAULT 'draft' 
        CHECK (status IN ('draft', 'pending', 'submitted', 'reviewed')),
    type TEXT NOT NULL DEFAULT 'report' 
        CHECK (type IN ('report', 'ppt', 'meeting_note')),
    drive_file_id TEXT, -- Google Drive file ID
    web_view_link TEXT, -- Google Drive web view link
    icon_link TEXT,
    mime_type TEXT,
    sections JSONB DEFAULT '{}',
    is_important BOOLEAN NOT NULL DEFAULT FALSE,
    start_date DATE,
    end_date DATE,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Usage in Code**:
- `AppContext.jsx` - Main data loading
- `DriveReportsModule.jsx` - Drive reports feature
- `useTasks.js` - Linking tasks to drive reports

**Critical Fields**:
- `drive_file_id`: Google Drive file identifier
- `web_view_link`: Direct link to view in Google Drive
- `type`: Distinguishes between reports, PPTs, and meeting notes
- `sections`: JSONB field for flexible content storage

### `report_views` (Was Missing)

```sql
CREATE TABLE report_views (
    id UUID PRIMARY KEY,
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(report_id, user_id)
);
```

**Usage in Code**:
- `useReports.js` - Track who has seen reports
- `AppContext.jsx` - Load view data with reports

**Purpose**: Track which users have viewed which reports, enabling "unread" indicators in UI.

### `groups.drive_settings` (Was Missing Column)

```sql
ALTER TABLE groups ADD COLUMN drive_settings JSONB DEFAULT '{}';
```

**Usage in Code**:
- `AppContext.jsx` - Read Drive settings
- `DriveReportsSettings.jsx` - Configure Drive integration
- `DriveReportsModule.jsx` - Use Drive credentials

**Expected Structure**:
```json
{
  "clientId": "google-oauth-client-id",
  "apiKey": "google-api-key",
  "reportsFolderId": "drive-folder-id-for-reports",
  "pptFolderId": "drive-folder-id-for-presentations",
  "meetingsFolderId": "drive-folder-id-for-meeting-notes"
}
```

---

## RLS Policies

### Existing Policies (from `20260122_fix_security.sql`)

All tables have RLS enabled. Key policy patterns:

1. **Profiles**: Viewable by everyone, updatable by owner
2. **Groups**: Viewable by authenticated users, updatable by creator
3. **Group Members**: Viewable by authenticated users
4. **Reports/Tasks/Knowledge**: Accessible only to group members
5. **Comments**: Viewable by group members, creatable by author

### Missing Policies (Need to be added)

The following tables have RLS policies defined in `20260122_fix_security.sql` but the tables didn't exist:

- `drive_reports` ✅ (policies exist, table was missing)
- `drive_report_comments` ✅ (policies exist, table was missing)
- `drive_report_task_links` ✅ (policies exist, table was missing)
- `report_views` ✅ (policies exist, table was missing)
- `knowledge_comments` ✅ (policies exist, table was missing)

**Action Required**: After applying `003_missing_tables.sql`, the existing RLS policies will work correctly.

---

## Functions and Triggers

### Existing Functions

1. **`update_updated_at_column()`**
   - Purpose: Auto-update `updated_at` timestamp
   - Applied to: `profiles`, `tasks`, `knowledge_items`, `drive_reports`, `announcements`
   - Status: ✅ Defined in `schema.sql`

2. **`handle_new_user()`** (if exists)
   - Purpose: Create profile when new user signs up
   - Trigger: After INSERT on `auth.users`
   - Status: ⚠️ Referenced in code but not in schema files

### Triggers

- `update_profiles_updated_at` on `profiles`
- `update_tasks_updated_at` on `tasks`
- `update_knowledge_updated_at` on `knowledge_items`
- `update_drive_reports_updated_at` on `drive_reports` (NEW)
- `update_announcements_updated_at` on `announcements` (NEW)

---

## Indexes

### Existing Indexes (from `schema.sql`)

All major foreign keys and frequently queried columns are indexed:
- Profile lookups by email and status
- Group lookups by code
- Report/Task/Knowledge lookups by group_id, author_id, status
- Activity log lookups by group_id, user_id, entity

### New Indexes (from `003_missing_tables.sql`)

Added indexes for all new tables following the same pattern:
- Foreign keys (group_id, author_id, etc.)
- Status and type columns
- Timestamp columns for sorting
- Unique identifiers (drive_file_id)

---

## Data Types and Constraints

### Common Patterns

1. **IDs**: All use `UUID` with `uuid_generate_v4()`
2. **Timestamps**: All use `TIMESTAMPTZ` with `DEFAULT NOW()`
3. **Status Fields**: Use `TEXT` with `CHECK` constraints for enum-like behavior
4. **Foreign Keys**: All use `ON DELETE CASCADE` for automatic cleanup
5. **Unique Constraints**: Applied to natural keys (email, code, composite keys)

### Status Enums

| Table | Status Field | Allowed Values |
|-------|--------------|----------------|
| `profiles` | status | 'active', 'pending', 'inactive' |
| `profiles` | system_role | 'admin', 'user' |
| `group_members` | role | 'student', 'supervisor', 'researcher', 'labmanager' |
| `group_members` | status | 'active', 'pending', 'inactive' |
| `reports` | status | 'draft', 'submitted', 'reviewed' |
| `drive_reports` | status | 'draft', 'pending', 'submitted', 'reviewed' |
| `drive_reports` | type | 'report', 'ppt', 'meeting_note' |
| `tasks` | status | 'todo', 'in_progress', 'done' |
| `tasks` | priority | 'low', 'medium', 'high' |
| `knowledge_items` | category | 'protocol', 'reference', 'note', 'resource' |

---

## Migration History

| Migration File | Date | Purpose | Status |
|----------------|------|---------|--------|
| `001_initial_schema.sql` | Unknown | Initial setup | ✅ Applied |
| `002_knowledge_enhancements.sql` | Unknown | Add knowledge comments | ✅ Applied |
| `20260122_fix_security.sql` | 2026-01-22 | RLS policies | ✅ Applied (but referenced missing tables) |
| `003_missing_tables.sql` | 2026-01-26 | **Add all missing tables** | ⚠️ **NEEDS TO BE APPLIED** |

---

## Critical Issues Found

### 1. Schema-Code Mismatch

**Problem**: 10 tables referenced in code but not defined in database schema.

**Impact**: 
- All Drive Reports features completely broken
- Announcements feature broken
- Report view tracking broken
- RBAC system broken

**Solution**: Apply `003_missing_tables.sql` migration.

### 2. RLS Policies for Non-Existent Tables

**Problem**: `20260122_fix_security.sql` defines policies for tables that don't exist.

**Impact**:
- Migration file would fail if run on fresh database
- Policies are defined but have no effect

**Solution**: Apply `003_missing_tables.sql` first, then RLS policies will work.

### 3. Missing Auth Trigger

**Problem**: Code references `handle_new_user()` trigger but it's not in schema files.

**Impact**:
- New user registration may not create profile automatically
- Manual profile creation required

**Solution**: Need to create this trigger or verify it exists in Supabase Auth.

---

## Recommendations

### Immediate Actions

1. **Apply Missing Tables Migration**
   ```bash
   # Using Supabase CLI
   supabase db push --file db/migrations/003_missing_tables.sql
   
   # Or manually in Supabase Dashboard SQL Editor
   ```

2. **Verify RLS Policies**
   ```sql
   -- Check if all policies are applied
   SELECT schemaname, tablename, policyname 
   FROM pg_policies 
   WHERE schemaname = 'public'
   ORDER BY tablename, policyname;
   ```

3. **Create Auth Trigger**
   ```sql
   CREATE OR REPLACE FUNCTION public.handle_new_user()
   RETURNS TRIGGER AS $$
   BEGIN
     INSERT INTO public.profiles (id, email, full_name, system_role, status)
     VALUES (
       NEW.id,
       NEW.email,
       COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
       'user',
       'pending'
     );
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;

   CREATE TRIGGER on_auth_user_created
     AFTER INSERT ON auth.users
     FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
   ```

### Long-Term Improvements

1. **Use Supabase CLI for Migrations**
   - Track all schema changes in git
   - Enable easy rollback
   - Consistent across environments

2. **Generate TypeScript Types**
   ```bash
   supabase gen types typescript --local > src/types/supabase.ts
   ```

3. **Add Database Tests**
   - Test RLS policies with different user roles
   - Verify cascade deletes work correctly
   - Test unique constraints

4. **Document Schema Changes**
   - Keep this document updated
   - Add comments to complex queries
   - Document JSONB field structures

---

## Next Steps

See `04-supabase-integration-audit.md` for analysis of how the application integrates with Supabase and where the state management issues occur.

---

**End of Database Inventory**
