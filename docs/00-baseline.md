# PHASE 0: Baseline Documentation

**Date**: 2026-01-26  
**Branch**: `rewrite/supabase-stabilization`  
**Status**: Initial Assessment

---

## Executive Summary

The pHD-NexusV2 application is a **Next.js + Supabase** research management platform that has experienced critical issues after migrating from a local implementation to Supabase. The primary symptoms include:

1. **UI State Inconsistency**: Delete operations succeed in the database but UI doesn't update until F5 refresh
2. **Missing Database Tables**: Multiple tables referenced in code but not defined in schema
3. **Multiple Supabase Client Instances**: Conflicting client implementations causing cache/state issues
4. **Incomplete RLS Policies**: Security policies reference tables that don't exist

---

## Current Setup Steps

### Prerequisites
```bash
Node.js: v18+ (detected from package.json)
npm: Latest
Supabase Project: Required (credentials in .env)
```

### Installation
```bash
git clone https://github.com/jeronimo9505/pHD-NexusV2
cd pHD-NexusV2
npm install
```

### Environment Variables
The `.env` file (gitignored) should contain:
```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<optional-google-oauth>
NEXT_PUBLIC_GOOGLE_API_KEY=<optional-google-drive>
```

### Running Locally
```bash
npm run dev
# Opens on http://localhost:3000
```

---

## Critical Issues Identified

### 1. **SCHEMA MISMATCH: Missing Tables**

The following tables are **referenced in code** but **NOT defined in `db/schema.sql`**:

| Table Name | Referenced In | Purpose |
|------------|---------------|---------|
| `drive_reports` | `AppContext.jsx`, `DriveReportsModule.jsx` | Google Drive-based reports |
| `drive_report_comments` | `AppContext.jsx`, RLS policies | Comments on drive reports |
| `drive_report_task_links` | `AppContext.jsx`, `useTasks.js` | Link tasks to drive reports |
| `drive_report_views` | `AppContext.jsx` | Track who viewed drive reports |
| `report_views` | `useReports.js`, `AppContext.jsx` | Track who viewed standard reports |
| `announcements` | `AppContext.jsx` | Group announcements |
| `announcement_comments` | `AppContext.jsx` | Comments on announcements |

**Impact**: 
- All queries to these tables will fail with "relation does not exist" errors
- RLS policies in `20260122_fix_security.sql` reference non-existent tables
- Application features are completely broken

**Evidence**:
```javascript
// From AppContext.jsx line 181
supabase.from('drive_reports')
    .select(`
        *,
        comments:drive_report_comments(*, author:profiles(full_name)),
        task_links:drive_report_task_links(*),
        views:drive_report_views(user_id, viewed_at)
    `)
```

### 2. **MULTIPLE SUPABASE CLIENT INSTANCES**

**Problem**: Two different Supabase client implementations exist:

1. **Old Client** (`src/lib/supabase.js`):
   ```javascript
   import { createBrowserClient } from '@supabase/ssr';
   export const supabase = createBrowserClient(containerUrl, containerKey);
   ```

2. **New Client** (`src/utils/supabase/client.ts`):
   ```javascript
   export function createClient() {
       return createBrowserClient(
           process.env.NEXT_PUBLIC_SUPABASE_URL!,
           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
       )
   }
   ```

**Usage**:
- `AuthContext.tsx` uses: `import { createClient } from '@/utils/supabase/client'`
- `useReports.js` uses: `import { supabase } from '@/lib/supabase'`
- `AppContext.jsx` uses: `import { supabase } from '../lib/supabase'`

**Impact**:
- Different clients may have different cache states
- Auth state may not propagate correctly
- Mutations on one client don't invalidate cache on another
- **This is likely the root cause of the "F5 refresh needed" bug**

### 3. **STATE MANAGEMENT ISSUES**

**Current Pattern**: 
- `AppContext.jsx` loads all data via `loadUserData()` and stores in React state
- Individual hooks (e.g., `useReports.js`) perform mutations but rely on `refreshUserData()` callback
- No optimistic updates
- No query invalidation strategy
- No realtime subscriptions

**Delete Flow Example** (from `useReports.js`):
```javascript
const deleteReport = async (reportId) => {
    const { error } = await supabase.from('reports').delete().eq('id', reportId);
    if (error) return { error };
    
    if (refreshUserData) await refreshUserData(); // ← Relies on callback
    return { error: null };
};
```

**Problem**:
- If `refreshUserData` fails silently, UI won't update
- If multiple components trigger mutations, race conditions occur
- No loading states during refresh
- User sees stale data until manual refresh

### 4. **INCOMPLETE README**

The `README.md` still contains Vite boilerplate text:
```markdown
# React + Vite

This template provides a minimal setup to get React working in Vite...
```

But the project is actually **Next.js** (confirmed by `package.json` and `next.config.js`).

---

## Reproduction Steps: "Delete Needs F5" Bug

### Setup
1. Log in to the application
2. Navigate to any module with deletable items (Reports, Tasks, Knowledge, Drive Reports)

### Steps to Reproduce
1. Click delete button on any item
2. Confirm deletion in modal
3. **Observe**: Item still appears in list
4. Press F5 to refresh page
5. **Observe**: Item is now gone

### Expected Behavior
- Item should disappear immediately after successful deletion
- No page refresh should be required

### Actual Behavior
- Database deletion succeeds (confirmed by checking Supabase directly)
- UI state is not updated
- Only a full page reload (F5) shows the correct state

### Root Cause Hypothesis
1. **Multiple Supabase clients** cause cache inconsistency
2. **No optimistic updates** in mutation functions
3. **`refreshUserData()` callback may fail silently** or not trigger re-render
4. **React state updates may be batched incorrectly** or lost due to closure issues

---

## Console Errors (Observed)

### On Page Load
```
⚠️ loadUserData: No userId provided!
```
- Indicates auth initialization race condition

### On Delete Operation
```
🔥 deleteDriveReport called with id: <uuid>
👤 currentUser: <uuid>
✅ Supabase delete successful, calling loadUserData...
✅ loadUserData completed
```
- Logs show deletion succeeds
- But UI doesn't reflect changes

### Network Tab
- DELETE request to Supabase succeeds (200 OK)
- Subsequent SELECT queries return correct data (without deleted item)
- But React state doesn't update

---

## Database Status

### Schema Applied
- `db/schema.sql` - Core tables (profiles, groups, reports, tasks, knowledge)
- `db/migrations/001_initial_schema.sql` - Initial setup
- `db/migrations/002_knowledge_enhancements.sql` - Knowledge comments
- `db/migrations/20260122_fix_security.sql` - RLS policies

### Missing Migrations
Need to create migrations for:
- `drive_reports` table
- `drive_report_comments` table
- `drive_report_task_links` table
- `drive_report_views` table
- `report_views` table
- `announcements` table
- `announcement_comments` table

---

## Recommendations for Supabase Local Development

### Option 1: Supabase CLI with Local Development

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize Supabase locally
supabase init

# Start local Supabase (includes Postgres, Auth, Storage, Realtime)
supabase start

# Apply migrations
supabase db reset

# Generate TypeScript types
supabase gen types typescript --local > src/types/supabase.ts
```

**Benefits**:
- Full local Supabase stack (Postgres + Auth + Storage + Realtime)
- Fast iteration without network latency
- Free (no cloud costs during development)
- Migration files tracked in git
- Easy to reset and test from scratch

### Option 2: Docker Compose with Postgres Only

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: supabase/postgres:15.1.0.117
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    ports:
      - "54322:5432"
```

**Benefits**:
- Lighter than full Supabase stack
- Good for testing database logic only
- Still need cloud Supabase for Auth

---

## Next Steps

1. **Complete Reverse Engineering** (Phase 1)
   - Map all features and UI flows
   - Document complete database schema (including missing tables)
   - Audit all Supabase integration points

2. **Root Cause Analysis** (Phase 2)
   - Confirm exact cause of "F5 refresh" bug
   - Identify all state consistency issues
   - Document auth flow problems

3. **Design Target Architecture** (Phase 3)
   - Single canonical Supabase client
   - Consistent data-access layer
   - Proper state management strategy
   - Complete database schema with migrations

4. **Implement Rebuild** (Phase 4)
   - Fix schema first (create missing tables)
   - Consolidate Supabase clients
   - Implement proper state updates
   - Add optimistic UI updates

5. **Test & Validate** (Phase 5)
   - Verify "delete without F5" works
   - Test all CRUD operations
   - Validate RLS policies
   - Ensure feature parity

---

## Files to Review in Phase 1

### Core Infrastructure
- `src/lib/supabase.js` - Old client (to be removed)
- `src/utils/supabase/client.ts` - New client (to be standardized)
- `src/utils/supabase/server.ts` - Server-side client
- `src/context/AuthContext.tsx` - Auth provider
- `src/context/AppContext.jsx` - Global state provider

### Database
- `db/schema.sql` - Core schema
- `db/migrations/*.sql` - All migrations
- `db/seeds/*.sql` - Seed data

### Feature Modules
- `src/components/modules/Reports/` - Reports module
- `src/components/modules/DriveReports/` - Drive reports module
- `src/components/modules/Tasks/` - Tasks module
- `src/components/modules/Knowledge/` - Knowledge base
- `src/components/modules/Admin/` - Admin panel
- `src/components/modules/Dashboard/` - Dashboard

### Hooks
- `src/components/modules/Reports/hooks/useReports.js`
- `src/components/modules/Tasks/hooks/useTasks.js`
- `src/components/modules/Knowledge/hooks/useKnowledge.js`

---

**End of Baseline Documentation**
