# PHASE 1: Architecture As-Is

**Date**: 2026-01-26  
**Status**: Complete System Map

---

## System Overview

pHD-NexusV2 is a **Next.js 16** application with **Supabase** backend for research group management. It provides:

- **Multi-tenant architecture** (groups/labs)
- **Role-based access control** (RBAC)
- **Scientific report management** (standard + Google Drive-based)
- **Task management** with assignments
- **Knowledge base** for protocols and references
- **Real-time collaboration** (announcements, comments)
- **Google Drive integration** for document generation

---

## Technology Stack

### Frontend
- **Framework**: Next.js 16.1.1 (App Router)
- **React**: 19.2.0
- **Styling**: Tailwind CSS 3.4.17
- **Icons**: Lucide React 0.562.0
- **Animations**: Framer Motion 12.24.12
- **PDF Generation**: jsPDF 3.0.2, html2pdf.js 0.14.0

### Backend
- **Database**: Supabase (PostgreSQL 15)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage (not heavily used)
- **Realtime**: Supabase Realtime (not currently implemented)

### External Integrations
- **Google Drive API**: Document creation and management
- **Google OAuth**: Drive authentication

---

## Project Structure

```
pHD-NexusV2/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (protected)/        # Protected routes (require auth)
│   │   │   ├── admin/          # Admin panel
│   │   │   ├── dashboard/      # Dashboard
│   │   │   ├── drive/          # Google Drive browser
│   │   │   ├── drive-reports/  # Drive-based reports
│   │   │   ├── knowledge/      # Knowledge base
│   │   │   ├── reports/        # Standard reports
│   │   │   ├── settings/       # User settings
│   │   │   ├── tasks/          # Task management
│   │   │   └── layout.jsx      # Protected layout
│   │   ├── login/              # Login page
│   │   ├── reset-password/     # Password reset
│   │   ├── waiting-approval/   # Pending approval page
│   │   ├── layout.jsx          # Root layout
│   │   └── page.tsx            # Home/redirect page
│   │
│   ├── components/
│   │   ├── auth/               # Auth components
│   │   ├── common/             # Shared components
│   │   ├── layout/             # Layout components (Sidebar, MainLayout)
│   │   ├── modules/            # Feature modules
│   │   │   ├── Admin/          # Admin panel components
│   │   │   ├── Dashboard/      # Dashboard components
│   │   │   ├── Drive/          # Google Drive components
│   │   │   ├── DriveReports/   # Drive reports components
│   │   │   ├── Knowledge/      # Knowledge base components
│   │   │   ├── Login/          # Login components
│   │   │   ├── Reports/        # Standard reports components
│   │   │   ├── Settings/       # Settings components
│   │   │   └── Tasks/          # Task management components
│   │   └── ui/                 # Reusable UI components
│   │
│   ├── context/
│   │   ├── AppContext.jsx      # Global app state (CRITICAL)
│   │   └── AuthContext.tsx     # Auth state (RBAC)
│   │
│   ├── lib/
│   │   ├── supabase.js         # OLD Supabase client (TO BE REMOVED)
│   │   ├── auth.js             # Auth utilities
│   │   └── mockDatabase.js     # Legacy mock data
│   │
│   ├── utils/
│   │   └── supabase/
│   │       ├── client.ts       # NEW Supabase client (browser)
│   │       └── server.ts       # NEW Supabase client (server)
│   │
│   ├── data/                   # Mock data (legacy)
│   ├── hooks/                  # Shared hooks
│   └── assets/                 # Static assets
│
├── db/
│   ├── schema.sql              # Core database schema
│   ├── migrations/             # Database migrations
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_knowledge_enhancements.sql
│   │   ├── 003_missing_tables.sql  # NEW - Missing tables
│   │   └── 20260122_fix_security.sql
│   └── seeds/                  # Seed data
│       └── 001_users.sql
│
├── docs/                       # Documentation (NEW)
│   ├── 00-baseline.md
│   ├── 03-db-inventory.md
│   └── ... (more to come)
│
├── package.json
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## Application Flow

### 1. Authentication Flow

```
User visits app
    ↓
App.jsx loads
    ↓
AuthContext initializes
    ├─→ supabase.auth.getSession()
    ├─→ supabase.auth.onAuthStateChange()
    └─→ Sets user/session state
    ↓
If authenticated:
    ├─→ Fetch profile from profiles table
    ├─→ Check status (active/pending)
    ├─→ Load user data via AppContext
    └─→ Redirect to dashboard
    ↓
If not authenticated:
    └─→ Redirect to /login
```

**Files Involved**:
- `src/context/AuthContext.tsx` - Auth state management
- `src/context/AppContext.jsx` - User data loading
- `src/app/(protected)/layout.jsx` - Route protection
- `src/components/modules/Login/Login.jsx` - Login UI

### 2. Data Loading Flow

```
User logs in
    ↓
AppContext.loadUserData(userId) called
    ↓
Fetch user's group memberships
    ├─→ Query group_members table
    └─→ Get list of group IDs
    ↓
Fetch groups user belongs to
    ├─→ Query groups table
    └─→ Store in groups state
    ↓
Determine active group
    ├─→ Check localStorage for last active
    ├─→ Default to first group if none
    └─→ Set activeGroupId
    ↓
Load all data for active group (parallel):
    ├─→ tasks (with assignees, comments, links)
    ├─→ reports (with sections, views, author)
    ├─→ drive_reports (with comments, tasks, views)
    ├─→ knowledge_items (with comments)
    ├─→ group_members (with profiles)
    └─→ announcements (with comments)
    ↓
Store all data in AppContext state
    ↓
Components consume via useApp() hook
```

**Critical File**: `src/context/AppContext.jsx` (712 lines)

### 3. Module Navigation Flow

```
User clicks module in sidebar
    ↓
setActiveModule('module_name')
    ↓
MainLayout renders selected module
    ↓
Module component mounts
    ├─→ Reads data from AppContext
    ├─→ Uses custom hooks (useReports, useTasks, etc.)
    └─→ Renders UI
    ↓
User performs action (create/update/delete)
    ↓
Hook function called
    ├─→ Supabase mutation executed
    ├─→ refreshUserData() called
    └─→ UI updates (eventually)
```

---

## State Management Architecture

### Current Pattern: **Centralized Context + Hooks**

#### AppContext (Global State)
- **Purpose**: Single source of truth for all app data
- **Location**: `src/context/AppContext.jsx`
- **State Managed**:
  - `currentUser` - Authenticated user with profile
  - `groups` - All groups user belongs to
  - `activeGroupId` - Currently selected group
  - `tasks` - All tasks for active group
  - `reports` - All standard reports for active group
  - `driveReports` - All drive reports for active group
  - `knowledge` - All knowledge items for active group
  - `groupMembers` - All members of active group
  - `announcements` - All announcements for active group
  - `activities` - Recent activity feed
  - UI state (activeModule, selectedReportId, etc.)

#### Feature Hooks (Data Access Layer)
- **Purpose**: Provide CRUD operations for specific entities
- **Pattern**: Read from AppContext, mutate via Supabase, refresh via callback
- **Examples**:
  - `useReports()` - Reports CRUD
  - `useTasks()` - Tasks CRUD
  - `useKnowledge()` - Knowledge CRUD

#### AuthContext (Auth State)
- **Purpose**: Manage authentication and RBAC
- **Location**: `src/context/AuthContext.tsx`
- **State Managed**:
  - `user` - Auth user object
  - `session` - Supabase session
  - `permissions` - User permissions set
  - `roles` - User roles array
  - `activeGroupId` - Currently selected group (duplicate with AppContext)

---

## Critical Architecture Issues

### Issue #1: Dual Supabase Clients

**Problem**: Two different Supabase client implementations coexist.

**Old Client** (`src/lib/supabase.js`):
```javascript
import { createBrowserClient } from '@supabase/ssr';
const supabaseInstance = createBrowserClient(containerUrl, containerKey);
export const supabase = supabaseInstance;
```

**New Client** (`src/utils/supabase/client.ts`):
```javascript
export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
}
```

**Usage**:
- `AuthContext.tsx` → Uses new client
- `AppContext.jsx` → Uses old client
- `useReports.js` → Uses old client
- `useTasks.js` → Uses old client
- All admin components → Use old client

**Impact**:
- Different cache states
- Auth state not synchronized
- Mutations on one client don't invalidate cache on another
- **ROOT CAUSE of "F5 refresh needed" bug**

### Issue #2: No Optimistic Updates

**Problem**: UI only updates after successful server round-trip.

**Current Pattern**:
```javascript
const deleteReport = async (reportId) => {
    const { error } = await supabase.from('reports').delete().eq('id', reportId);
    if (error) return { error };
    
    await refreshUserData(); // ← Waits for full data reload
    return { error: null };
};
```

**Better Pattern** (not implemented):
```javascript
const deleteReport = async (reportId) => {
    // Optimistic update
    setReports(prev => prev.filter(r => r.id !== reportId));
    
    const { error } = await supabase.from('reports').delete().eq('id', reportId);
    
    if (error) {
        // Rollback on error
        await refreshUserData();
        return { error };
    }
    
    return { error: null };
};
```

### Issue #3: Refresh Callback Pattern

**Problem**: Mutations rely on `refreshUserData()` callback which:
- Reloads ALL data for the group (expensive)
- May fail silently
- Creates race conditions if multiple mutations happen
- No loading states

**Example** (from `useTasks.js`):
```javascript
export function useTasks() {
    const { tasks: rawTasks, refreshUserData } = useApp();
    
    const deleteTask = async (taskId) => {
        // ... delete logic ...
        if (refreshUserData) await refreshUserData(); // ← Fragile
    };
}
```

### Issue #4: No Realtime Subscriptions

**Problem**: No realtime updates when other users make changes.

**Current**: User must manually refresh or wait for next data load.

**Better**: Subscribe to table changes and update UI automatically.

```javascript
// Not implemented
useEffect(() => {
    const subscription = supabase
        .channel('reports')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'reports',
            filter: `group_id=eq.${activeGroupId}`
        }, (payload) => {
            // Update local state
        })
        .subscribe();
    
    return () => subscription.unsubscribe();
}, [activeGroupId]);
```

### Issue #5: State Duplication

**Problem**: `activeGroupId` is managed in both AppContext and AuthContext.

**Impact**:
- Potential for desync
- Confusing which one is source of truth
- Extra complexity

---

## Module Breakdown

### 1. Dashboard Module
- **Path**: `src/components/modules/Dashboard/`
- **Features**:
  - Activity feed
  - Recent reports
  - Announcements
  - Quick stats
- **Data Sources**: AppContext (activities, reports, announcements)

### 2. Reports Module (Standard)
- **Path**: `src/components/modules/Reports/`
- **Features**:
  - Create/edit/delete reports
  - Weekly report structure (5 sections)
  - Comments and annotations
  - Link tasks and knowledge items
  - Submit for review
  - Mark as seen
- **Data Sources**: useReports hook → AppContext
- **Tables Used**: reports, report_sections, report_comments, report_views, report_task_links, report_knowledge_links

### 3. Drive Reports Module
- **Path**: `src/components/modules/DriveReports/`
- **Features**:
  - Create Google Docs reports
  - Upload PowerPoint presentations
  - Create meeting notes
  - Link tasks to drive reports
  - Track views
  - Comments
- **Data Sources**: AppContext (driveReports)
- **Tables Used**: drive_reports, drive_report_comments, drive_report_task_links, drive_report_views
- **External**: Google Drive API

### 4. Tasks Module
- **Path**: `src/components/modules/Tasks/`
- **Features**:
  - Create/edit/delete tasks
  - Assign to users
  - Set priority and due date
  - Link to reports (standard or drive)
  - Comments
  - Status tracking (todo/in_progress/done)
- **Data Sources**: useTasks hook → AppContext
- **Tables Used**: tasks, task_assignees, task_comments, report_task_links, drive_report_task_links

### 5. Knowledge Module
- **Path**: `src/components/modules/Knowledge/`
- **Features**:
  - Store protocols, references, notes
  - Categorize items
  - Tag system
  - Comments
  - Link to reports
- **Data Sources**: useKnowledge hook → AppContext
- **Tables Used**: knowledge_items, knowledge_comments, report_knowledge_links

### 6. Admin Module
- **Path**: `src/components/modules/Admin/`
- **Features**:
  - User management (approve/reject)
  - Group management (create/edit/delete)
  - Member management (add/remove/change roles)
  - System-level admin functions
- **Access**: system_role = 'admin' only
- **Tables Used**: profiles, groups, group_members

### 7. Settings Module
- **Path**: `src/components/modules/Settings/`
- **Features**:
  - User profile editing
  - Group selection
  - Drive configuration
- **Tables Used**: profiles, groups

---

## Data Flow Patterns

### Pattern 1: List View
```
Component mounts
    ↓
useApp() hook
    ↓
Read data from AppContext state
    ↓
Render list
```

### Pattern 2: Create
```
User clicks "Create"
    ↓
Modal/Form opens
    ↓
User fills data
    ↓
Submit → Hook function
    ↓
supabase.from('table').insert(data)
    ↓
refreshUserData()
    ↓
AppContext reloads all data
    ↓
Component re-renders with new data
```

### Pattern 3: Update
```
User edits item
    ↓
Submit → Hook function
    ↓
supabase.from('table').update(data).eq('id', id)
    ↓
refreshUserData()
    ↓
AppContext reloads all data
    ↓
Component re-renders
```

### Pattern 4: Delete (BROKEN)
```
User clicks delete
    ↓
Confirm dialog
    ↓
Hook function
    ↓
supabase.from('table').delete().eq('id', id)
    ↓ SUCCESS (database updated)
refreshUserData()
    ↓ ISSUE: May not trigger re-render
Component still shows old data
    ↓
User presses F5
    ↓
Full page reload
    ↓
Data loads fresh from server
    ↓
Item is gone ✓
```

---

## Authentication & Authorization

### Authentication (Supabase Auth)
- Email/password login
- Password reset via email
- Session persistence
- Auto-refresh tokens

### Authorization (RBAC)

#### System Roles (in `profiles` table)
- `admin` - System administrator (full access)
- `user` - Regular user (group-level access)

#### Group Roles (in `group_members` table)
- `owner` - Group creator (full group control)
- `labmanager` - Lab manager (administrative permissions)
- `supervisor` - Supervisor (elevated permissions)
- `researcher` - Researcher (standard permissions)
- `student` - Student (basic permissions)

#### Permission Checking
```javascript
// From AppContext
const hasRole = (requiredRole) => {
    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
};

// From AuthContext (RBAC - not fully implemented)
const can = (permissionCode) => {
    if (roles.includes('admin')) return true;
    if (permissions.has(permissionCode)) return true;
    return false;
};
```

**Issue**: RBAC system (roles/permissions tables) exists in AuthContext but tables don't exist in database (fixed in `003_missing_tables.sql`).

---

## External Integrations

### Google Drive Integration

**Purpose**: Create and manage Google Docs/Slides directly from app.

**Files**:
- `src/components/modules/Drive/services/googleDriveService.js` - Drive API wrapper
- `src/components/modules/DriveReports/DriveReportsModule.jsx` - Main UI
- `src/components/modules/DriveReports/components/ReportEditor.jsx` - Report generator

**Flow**:
1. User configures Google OAuth credentials in group settings
2. User authenticates with Google (OAuth popup)
3. App can create/read/update files in user's Drive
4. Files are created in configured folders
5. Links stored in `drive_reports` table

**API Used**:
- Google Drive API v3
- Google Docs API
- Google Slides API

---

## Next Steps

See `04-supabase-integration-audit.md` for detailed analysis of Supabase integration issues and `05-root-cause-analysis.md` for confirmed root causes of the "F5 refresh" bug.

---

**End of Architecture Documentation**
