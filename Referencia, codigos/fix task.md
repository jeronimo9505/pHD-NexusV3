Comprehensive Code Audit — phd-nexusv3

  CRITICAL (fix before next release)

  [x] 1. group_settings table reference — TypeScript error at build time
  - src/app/(dashboard)/[groupId]/knowledge/page.tsx queries a group_settings table that does not exist in supabase.ts types.
  - Causes type errors and will fail if RLS blocks access to a non-existent table.
  - Fix: either create the table in Supabase with a migration, or remove the dead query.

  [x] 2. tsconfig.json — strict: false
  - Disables null checks, implicit any, and strict function types across the entire codebase.
  - The 58+ Json type casting issues and several as any usages are only safe-looking because strict mode is off.
  - Fix: enable "strict": true and resolve the resulting errors incrementally.

  ---
  HIGH

  3. Supabase Json type — 58 unsafe casts
  - src/types/supabase.ts uses Json (a union type) for JSONB columns. Downstream code casts these with as any or does no narrowing.
  - Add a parseJson<T> helper with a Zod schema or manual type guard at each call site.

  4. N+1 query in logbook clone (src/features/logbook/actions.ts)
  - cloneLogbookTemplate fetches entries one-by-one inside a loop instead of a single bulk insert.
  - Fix: collect all rows, then call supabase.from('entries').insert(rows) once.

  5. Missing error.tsx boundaries
  - Routes under (dashboard)/[groupId]/* have no error.tsx. An unhandled server exception crashes the entire subtree with a blank page.
  - Add error.tsx at the [groupId] layout level minimum.

  6. getSystemRole() not cached
  - src/lib/auth/roles.ts:46 — unlike fetchGroupRole, the profile query in getSystemRole is not wrapped with React.cache(), so layout + page both hit the
  DB.
  - Fix: wrap the inner fetch with cache() the same way fetchGroupRole is.

  7. console.log leaking to production
  - 14 console.log calls in server actions/components. Strip or gate behind process.env.NODE_ENV === 'development'.

  ---
  MEDIUM

  8. Missing loading.tsx on 9+ dynamic routes
  - (dashboard)/[groupId]/reports, /tasks, /knowledge, /settings, /logbook all lack loading.tsx. Users see a blank frame during RSC data fetching.
  - Add skeleton loading.tsx files — even a <div className="animate-pulse" /> is better than nothing.

  9. Missing not-found.tsx for [groupId]
  - If a user navigates to a deleted or unauthorized group, Next.js falls through to the global 404. A group-level not-found.tsx with a "return to
  dashboard" CTA is better UX.

  10. No Suspense boundaries around slow data
  - Several pages await multiple Supabase calls sequentially before rendering anything. Wrapping independent fetches in <Suspense> + parallel Promise.all
  would cut TTFB.

  [x] 11. src/app/(auth)/login/page.tsx — direct createClient() call without guard
  - If NEXT_PUBLIC_SUPABASE_URL is missing at build time (e.g. preview deploys without env vars), the page throws before rendering.
  - The middleware already fails-open; the page should too. Wrap in try-catch or check env vars first.

  ---
  LOW

  12. src/features/auth/components/GoogleSignInButton.tsx — popup polling via setInterval
  - The 500 ms interval runs indefinitely if the popup is closed without completing auth. Add a max-iteration guard or use
  window.addEventListener('message', ...) instead.

  13. src/app/auth/callback/route.ts — google_provider_token cookie with no expiry
  - The cookie is set without maxAge/expires, so it's a session cookie. If the user's Google token expires mid-session, Drive/Docs API calls will fail
  silently.
  - Set maxAge to match the Google token TTL (~1 hour) or refresh it.