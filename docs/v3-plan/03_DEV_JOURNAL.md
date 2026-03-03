# 03_DEV_JOURNAL.md

## 2026-01-28 - Initial Planning & Discovery

### Discovery Findings
*   **Legacy Code**: Relies heavily on Zustand for data persistence, causing sync issues. `useDriveReportsStore.ts` manual CRUD logic is a prime example of "what not to do" in the new version.
*   **Schema**: Found a discrepancy with `drive_reports`. It was missing from `schema.sql` but found in migrations `006` and `008`.
*   **Decision**: We will treat the database (Supabase) as the absolute Source of Truth. No client-side arrays mirroring the DB.

### Architectural Decisions
*   **Framework**: Next.js 15+ (App Router).
*   **Data Fetching**: Server Components for extensive reads.
*   **Mutations**: Server Actions for all writes. zod for validation.
*   **UI State**: Zustand (minimal usage).
*   **Styling**: Tailwind CSS (reusing existing tokens).

### Open Questions / Risks
*   **Google Drive API**: The legacy code uses a client-side library (`gapi`). We need to decide if we keep it client-side (for user consent flows) or move it server-side (Service Account?).
    *   *Temporary Stance*: Keep client-side `gapi` for now if it relies on User's own OAuth token, but orchestrate the *metadata saving* via Server Actions.

---
*Log started by Antigravity.*
