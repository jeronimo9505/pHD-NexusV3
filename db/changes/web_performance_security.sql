-- Reviewed against V11PHD on 2026-10-26. Reversal is in db/rollback/.
-- No business rows are modified. Existing admin workflows remain supported.

CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    IF current_user IN ('anon', 'authenticated') AND
       (NEW.id IS DISTINCT FROM OLD.id OR NEW.system_role IS DISTINCT FROM OLD.system_role
        OR NEW.status IS DISTINCT FROM OLD.status OR NEW.email IS DISTINCT FROM OLD.email) THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'admin') THEN
            RAISE EXCEPTION 'Only administrators can change protected profile fields' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_profile_privileges BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();
REVOKE ALL ON FUNCTION public.guard_profile_privileges() FROM PUBLIC, anon, authenticated;

ALTER POLICY "Users can request to join groups" ON public.group_members
WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'pending' AND role = 'student');

-- Restrictive policies intersect with the existing policies instead of
-- introducing a permissive OR that could widen access.
CREATE POLICY "web_active_members_only" ON public.samples AS RESTRICTIVE TO authenticated
USING (EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = samples.group_id AND gm.user_id = (SELECT auth.uid()) AND gm.status = 'active'));
CREATE POLICY "web_active_members_only" ON public.sample_characterizations AS RESTRICTIVE TO authenticated
USING (EXISTS (SELECT 1 FROM public.samples s JOIN public.group_members gm ON gm.group_id = s.group_id WHERE s.id = sample_characterizations.sample_id AND gm.user_id = (SELECT auth.uid()) AND gm.status = 'active'));
CREATE POLICY "web_active_members_only" ON public.drive_reports AS RESTRICTIVE TO authenticated
USING (EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = drive_reports.group_id AND gm.user_id = (SELECT auth.uid()) AND gm.status = 'active'));
CREATE POLICY "web_active_members_only" ON public.raman_workspaces AS RESTRICTIVE TO authenticated
USING (EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = raman_workspaces.group_id AND gm.user_id = (SELECT auth.uid()) AND gm.status = 'active'));

CREATE OR REPLACE FUNCTION public.guard_drive_report_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE uid text := (SELECT auth.uid())::text;
BEGIN
    IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
    IF NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
        RAISE EXCEPTION 'Report ownership cannot be reassigned' USING ERRCODE = '42501';
    END IF;
    IF uid IS NULL OR (OLD.author_id::text IS DISTINCT FROM uid AND
        (to_jsonb(NEW) - 'seen_by' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'seen_by' - 'updated_at')) THEN
        RAISE EXCEPTION 'Only the author can edit report content' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(COALESCE(NEW.seen_by, '[]'::jsonb)) <> 'array' OR
       (COALESCE(NEW.seen_by, '[]'::jsonb) - uid) IS DISTINCT FROM (COALESCE(OLD.seen_by, '[]'::jsonb) - uid) THEN
        RAISE EXCEPTION 'Only your own read receipt can be changed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_drive_report_updates BEFORE UPDATE ON public.drive_reports
FOR EACH ROW EXECUTE FUNCTION public.guard_drive_report_updates();
REVOKE ALL ON FUNCTION public.guard_drive_report_updates() FROM PUBLIC, anon, authenticated;

-- Cover the actual joins and group/order lookups without removing old indexes.
CREATE INDEX web_characterizations_sample_idx ON public.sample_characterizations(sample_id);
CREATE INDEX web_samples_logbook_order_idx ON public.samples(logbook_id, created_at DESC, id);
CREATE INDEX web_samples_parent_idx ON public.samples(parent_id);
CREATE INDEX web_workspaces_group_order_idx ON public.raman_workspaces(group_id, created_at DESC);
CREATE INDEX web_notes_group_order_idx ON public.group_notes(group_id, created_at DESC);
CREATE INDEX web_calendar_group_start_idx ON public.calendar_events(group_id, start_at);
