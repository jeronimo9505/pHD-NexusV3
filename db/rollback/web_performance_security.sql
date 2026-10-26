-- Emergency reversal of web_performance_security only.
-- Does not restore any data (the forward change does not alter business rows).
-- Restores the prior, weaker permissions. Prefer a forward fix for security.
BEGIN;
DROP TRIGGER IF EXISTS guard_profile_privileges ON public.profiles;
DROP FUNCTION IF EXISTS public.guard_profile_privileges();
DROP TRIGGER IF EXISTS guard_drive_report_updates ON public.drive_reports;
DROP FUNCTION IF EXISTS public.guard_drive_report_updates();
DROP POLICY IF EXISTS "web_active_members_only" ON public.samples;
DROP POLICY IF EXISTS "web_active_members_only" ON public.sample_characterizations;
DROP POLICY IF EXISTS "web_active_members_only" ON public.drive_reports;
DROP POLICY IF EXISTS "web_active_members_only" ON public.raman_workspaces;
ALTER POLICY "Users can request to join groups" ON public.group_members
WITH CHECK (auth.uid() = user_id AND status = 'pending');
DROP INDEX IF EXISTS public.web_characterizations_sample_idx;
DROP INDEX IF EXISTS public.web_samples_logbook_order_idx;
DROP INDEX IF EXISTS public.web_samples_parent_idx;
DROP INDEX IF EXISTS public.web_workspaces_group_order_idx;
DROP INDEX IF EXISTS public.web_notes_group_order_idx;
DROP INDEX IF EXISTS public.web_calendar_group_start_idx;
COMMIT;
