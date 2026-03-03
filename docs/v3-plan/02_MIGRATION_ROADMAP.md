# 02_MIGRATION_ROADMAP.md

## High-Level Timeline

### Phase 1: Foundation & Setup (Current Focus)
**Goal**: Establish the "Clean Code" environment and valid scaffolding.

- [ ] **1.1 Environment Setup**: Install standard dependencies (`lucide-react`, `zod`, `clsx`, `tailwind-merge`, `sonner`).
- [ ] **1.2 Type Generation**: Run `npx supabase gen types` to get the Source of Truth.
- [ ] **1.3 Base Layouts**: Create Root Layout, Auth Layout, and Dashboard Shell (Sidebar + Navbar) using Server Components.
- [ ] **1.4 Auth Integration**: Port Supabase Auth (Middleware + Server Actions) to ensure protected routes work.

### Phase 2: Vertical "Drive Reports" (Deep Vertical)
**Goal**: Prove the architecture with the most complex feature first.

- [ ] **2.1 Domain Setup**: Create `/features/drive-reports` structure.
- [ ] **2.2 Server Actions**: Implement `create`, `update`, `delete`, `markAsSeen` using purely Server Actions.
- [ ] **2.3 List View**: Implement Server Component fetching + Client List UI.
- [ ] **2.4 Create/Edit Flow**: Implement "meeting note" creation logic (Google Drive API integration on Server Side?).
    *   *Decision Needed*: Will Drive API calls happen in Server Actions (Node.js) or Client (Browser)? *Recommendation: Server Actions for security and consistency.*
- [ ] **2.5 Polishing**: Optimistic UI for "Mark as Seen".

### Phase 3: Vertical "Users & Groups"
**Goal**: Core administrative features.

- [ ] **3.1 Profile Management**: Reads/Writes for `profiles`.
- [ ] **3.2 Group Management**: Admin Panel replacement.
- [ ] **3.3 Invite System**: Handling `group_members` additions.

### Phase 4: Remaining Modules
- [ ] Tasks
- [ ] Knowledge Base
- [ ] Regular Reports (if distinct from Drive Reports)

## Definition of Done (DoD) per Feature
1.  **Zero Hydration Errors**: No console errors on refresh.
2.  **Network Resilience**: Logic does not break if network is slow (Server Actions handle pending states).
3.  **Typed**: No `any` types. All data strictly typed from Supabase.
4.  **Responsive**: Works on Mobile.
5.  **Linted**: Passes ESLint rules.
