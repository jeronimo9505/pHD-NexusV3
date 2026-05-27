# 01_ARCHITECTURE_BLUEPRINT.md

## 1. Directory Structure (Greenfield)

We will use a feature-based architecture within `src-v3` to ensure isolation from legacy code (`src`).

```
/src-v3
  /app                    # Next.js App Router
    /(auth)               # Route Group for Auth
      /login/page.tsx
    /(platform)           # Protected Routes
      /layout.tsx         # Sidebar, User Context
      /[groupId]          # Dynamic Group Route
        /dashboard/page.tsx
        /drive-reports    # Vertical: Drive Reports
          /page.tsx       # Server Component (List)
          /new/page.tsx   # Server Component (Create)
          /[id]/page.tsx  # Server Component (Detail)
  
  /components
    /ui                   # Shadcn/Radix atomic components
    /layouts              # Global layouts
  
  /features               # Domain Logic (The Core)
    /auth
      /actions.ts         # Server Actions
      /components         # Auth Forms
    /drive-reports
      /actions.ts         # Server Actions (create, update, delete)
      /components         # Client Components (Forms, Lists, interactive parts)
        /report-list.tsx
        /report-card.tsx
      /types.ts           # Domain-specific types (extending DB types)
      /utils.ts           # Domain helpers
    /shared               # Shared utilities across features
  
  /lib
    /supabase             # Supabase Clients
      /server.ts          # createServerClient (cookies)
      /client.ts          # createBrowserClient
    /utils.ts             # cn, etc.
  
  /types
    /supabase.ts          # Auto-generated Database Types
```

## 2. Data Flow Strategy ("The Holy Laws")

### Reading Data (Server Components First)
1.  **Server Component (`page.tsx`)**: Fetches data directly from Supabase.
2.  **Props Passing**: Passes plain data (serialized JSON) to Client Components.
3.  **No Store for Data**: We will NOT use generic Zustand stores for DB data.

**Example Flow (Drive Reports List):**
`DriveReportsPage (Server)` -> `await supabase.from('drive_reports').select('*')` -> `<ReportList initialData={data} />`

### Writing Data (Server Actions)
1.  **User Interaction**: Click "Create Report".
2.  **Server Action**: Call `createDriveReportAction(formData)` in `/features/drive-reports/actions.ts`.
3.  **Validation**: Zod schema validation runs on the server.
4.  **DB Update**: `supabase.from('drive_reports').insert(...)`.
5.  **Revalidation**: `revalidatePath('/[groupId]/drive-reports')`.
6.  **UI Feedback**: Client component receives result, shows Toast, and auto-refreshes due to revalidation.

### State Management (Client)
*   **Zustand**: Used **ONLY** for UI state (e.g., `isSidebarOpen`, `activeModalId`).
*   **TanStack Query**: Used **ONLY** where strictly necessary for complex client-side filtering or polling (e.g., waiting for a Google Drive file to process), initiated with `initialData` from server.

## 3. Component Strategy

| Component | Type | Responsibility |
| :--- | :--- | :--- |
| `Page.tsx` | **Server** | Fetch data, validate permissions, render Layout. |
| `ReportList.tsx` | **Client** | Render list, handle sorting (URL based), client-side search. |
| `ReportCard.tsx` | **Client** | Render individual item, "Mark as Seen" interaction. |
| `CreateReportModal` | **Client** | Form handling, local validation, calling Server Action. |
| `Navbar`/`Sidebar` | **Server** | Fetch user profile/groups. Render active state. |

## 4. Error Handling
*   **Server Actions**: Return `{ error: string } | { success: true, data: ... }`. Client handles this to show `toast.error()`.
*   **Server Components**: Use `error.tsx` file for segment-level error boundaries.
*   **Global**: Global `not-found.tsx` and generic error pages.

## 5. Typing Strategy
*   **Strict Source**: `type Database = DatabaseGeneratedType;`
*   **Domain Types**: `type DriveReport = Database['public']['Tables']['drive_reports']['Row'];`
*   **NO Manual Interfaces**: We will not manually type `interface Report { ... }` unless it's a composite type not in DB.
