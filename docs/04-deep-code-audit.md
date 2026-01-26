# Deep Code Audit - Critical Issues Found

**Date**: 2026-01-26  
**Scope**: Complete codebase analysis

---

## 🔴 CRITICAL ISSUES DISCOVERED

### Issue #1: Dual State Management for activeGroupId

**Problem**: Both `AuthContext` and `AppContext` manage `activeGroupId` independently.

**Evidence**:
```typescript
// AuthContext.tsx:15
const [activeGroupId, setActiveGroupId] = useState(null);

// AppContext.jsx:31
const [activeGroupId, setActiveGroupId] = useState(null);
```

**Impact**:
- State can desync between contexts
- Race conditions when switching groups
- Unclear which is source of truth
- Permissions may load for wrong group

**Root Cause**: Poor separation of concerns

---

### Issue #2: AuthContext Uses Different Supabase Client

**Problem**: `AuthContext` still uses old client pattern.

**Evidence**:
```typescript
// AuthContext.tsx:4
import { createClient } from '@/utils/supabase/client';

// AuthContext.tsx:17
const supabase = createClient(); // Creates NEW instance every render!
```

**Impact**:
- Creates new client on every render (memory leak)
- Different client than AppContext uses
- Auth state may not sync with data queries

**Fix Needed**: Use canonical singleton client

---

### Issue #3: No Direct State Updates in Hooks

**Problem**: Hooks can't update AppContext state directly.

**Current Pattern**:
```javascript
// useReports.js
const deleteReport = async (id) => {
    await supabase.from('reports').delete().eq('id', id);
    await refreshUserData(); // ← Reloads ALL data
};
```

**Why This Causes F5 Bug**:
1. `refreshUserData()` is async callback
2. If callback fails silently, state doesn't update
3. No way to update `reports` state directly from hook
4. User must F5 to force reload

**Better Pattern** (not implemented):
```javascript
// Hook should manage its own state
const [reports, setReports] = useState([]);

const deleteReport = async (id) => {
    setReports(prev => prev.filter(r => r.id !== id)); // Immediate
    await supabase.from('reports').delete().eq('id', id);
};
```

---

### Issue #4: AppContext Exposes setState Functions

**Problem**: AppContext exports raw setState functions.

**Evidence**:
```javascript
// AppContext.jsx:546
reports, setReports,
tasks, setTasks,
knowledge, setKnowledge,
// ... etc
```

**Impact**:
- Any component can mutate global state
- No validation or business logic
- Hard to track where state changes happen
- Breaks encapsulation

**Better**: Only expose action functions, not setters

---

### Issue #5: Race Condition in loadUserData

**Problem**: Multiple async queries run in parallel without coordination.

**Evidence**:
```javascript
// AppContext.jsx:150-190 (approximate)
const [tasksRes, reportsRes, knowledgeRes, membersRes, driveReportsRes, announcementsRes] = 
    await Promise.all([
        supabase.from('tasks').select(...),
        supabase.from('reports').select(...),
        supabase.from('knowledge_items').select(...),
        supabase.from('group_members').select(...),
        supabase.from('drive_reports').select(...),
        supabase.from('announcements').select(...)
    ]);

// Then sets state for each
setTasks(tasksRes.data || []);
setReports(reportsRes.data || []);
// ...
```

**Problems**:
- If one query fails, others still set state
- No transaction-like behavior
- Partial state updates possible
- No loading state per query

---

### Issue #6: useReports_temp.js Exists

**Problem**: Temporary/backup file in production code.

**Evidence**:
```
src/components/modules/Reports/hooks/useReports_temp.js
```

**Impact**:
- Confusing which file is correct
- May have duplicate logic
- Increases bundle size

**Fix**: Delete or rename appropriately

---

### Issue #7: Missing Error Boundaries

**Problem**: No React Error Boundaries to catch rendering errors.

**Impact**:
- One component error crashes entire app
- No graceful degradation
- Poor user experience

**Fix**: Add Error Boundaries around major modules

---

### Issue #8: No Loading States During Mutations

**Problem**: Delete/create/update operations don't show loading state.

**Impact**:
- User can click delete multiple times
- No feedback that operation is in progress
- Confusing UX

**Fix**: Add loading states to all mutation buttons

---

### Issue #9: Inconsistent Error Handling

**Problem**: Some functions return `{ error }`, others throw, others return null.

**Examples**:
```javascript
// Pattern 1: Return error object
return { error: 'Something failed' };

// Pattern 2: Return null on error
if (error) return null;

// Pattern 3: Throw exception
throw new Error('Failed');
```

**Impact**:
- Callers don't know how to handle errors
- Some errors swallowed silently
- Inconsistent UX

**Fix**: Standardize on one pattern

---

### Issue #10: No Optimistic UI for Create/Update

**Problem**: Only delete has optimistic updates (and incomplete).

**Impact**:
- Creating item doesn't show in list immediately
- Updating item doesn't reflect changes immediately
- Inconsistent UX

**Fix**: Add optimistic updates for all mutations

---

## 📊 State Management Analysis

### Current Architecture (Problematic)

```
┌─────────────────────────────────────────┐
│          AuthContext                    │
│  - user, session                        │
│  - permissions, roles                   │
│  - activeGroupId (DUPLICATE!)           │
│  - Uses createClient() (NEW INSTANCE)   │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│          AppContext                     │
│  - currentUser                          │
│  - activeGroupId (DUPLICATE!)           │
│  - tasks, reports, knowledge, etc.      │
│  - Exposes setState functions           │
│  - Uses singleton client                │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│          Feature Hooks                  │
│  - useReports, useTasks, etc.           │
│  - Read from AppContext                 │
│  - Mutate via Supabase                  │
│  - Call refreshUserData() callback      │
└─────────────────────────────────────────┘
```

**Problems**:
- ❌ Duplicate state (activeGroupId)
- ❌ Different Supabase clients
- ❌ No direct state updates
- ❌ Fragile callback pattern
- ❌ Exposed setState functions

---

### Recommended Architecture

```
┌─────────────────────────────────────────┐
│          AuthContext                    │
│  - user, session (auth only)            │
│  - signIn, signOut, signUp              │
│  - Uses singleton client                │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│          AppContext                     │
│  - activeGroupId (SINGLE SOURCE)        │
│  - userRole, permissions                │
│  - Orchestrates data loading            │
│  - Does NOT expose setState             │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│          Feature Stores                 │
│  - useReportsStore (Zustand/Context)    │
│  - useTasksStore                        │
│  - useKnowledgeStore                    │
│  - Manage own state                     │
│  - Optimistic updates                   │
│  - Direct mutations                     │
└─────────────────────────────────────────┘
```

**Benefits**:
- ✅ Single source of truth
- ✅ Clear separation of concerns
- ✅ Direct state updates
- ✅ Optimistic UI possible
- ✅ Encapsulated state

---

## 🎯 Recommended Rebuild Strategy

### Option A: Minimal Fix (Quick)
**Time**: 2-3 hours  
**Risk**: Low  

1. Fix AuthContext to use singleton client
2. Remove duplicate activeGroupId from AuthContext
3. Add proper error handling to all mutations
4. Keep current architecture otherwise

**Pros**: Fast, low risk  
**Cons**: Doesn't solve fundamental issues

---

### Option B: Moderate Refactor (Recommended)
**Time**: 1-2 days  
**Risk**: Medium  

1. Consolidate state management
2. Move activeGroupId to AppContext only
3. Create feature-specific stores (Zustand)
4. Implement optimistic updates for all CRUD
5. Add loading states
6. Standardize error handling

**Pros**: Solves most issues, modern architecture  
**Cons**: Requires testing all features

---

### Option C: Complete Rebuild (Thorough)
**Time**: 1 week  
**Risk**: High  

1. Migrate to React Query for server state
2. Separate client state (UI) from server state (data)
3. Add Supabase Realtime subscriptions
4. Implement proper TypeScript throughout
5. Add comprehensive testing
6. Add Error Boundaries

**Pros**: Best long-term solution  
**Cons**: Time-consuming, high risk of regressions

---

## 🔧 Immediate Actions Needed

### 1. Fix AuthContext Client (CRITICAL)

**Current**:
```typescript
const supabase = createClient(); // Inside component!
```

**Fixed**:
```typescript
import { supabase } from '@/lib/supabase/client';
// Use singleton
```

### 2. Remove Duplicate activeGroupId

**Decision needed**: Which context should own it?
- **Recommendation**: AppContext (it's app-level state, not auth)

### 3. Fix refreshUserData Pattern

**Current**: Callback-based, fragile  
**Better**: Event-based or direct state updates

---

## 📝 Next Steps

1. **User Decision**: Which rebuild strategy? (A, B, or C)
2. **Apply database migration** (still pending)
3. **Install Supabase CLI** (for local dev)
4. **Implement chosen strategy**
5. **Test thoroughly**

---

**Recommendation**: Go with **Option B** (Moderate Refactor)
- Fixes fundamental issues
- Reasonable time investment
- Maintains feature parity
- Sets up for future improvements

---

**End of Audit**
