CREATE TABLE public.characterization_recovery (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),record_id uuid NOT NULL,group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
 record_snapshot jsonb NOT NULL,created_by uuid NOT NULL,deleted_at timestamptz NOT NULL DEFAULT now(),
 cleanup_state text NOT NULL DEFAULT 'pending' CHECK(cleanup_state IN ('pending','quarantined','retained','restored')),
 cleanup_receipt jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX characterization_recovery_group_date ON public.characterization_recovery(group_id,deleted_at DESC);
CREATE INDEX characterization_recovery_record ON public.characterization_recovery(record_id);
ALTER TABLE public.characterization_recovery ENABLE ROW LEVEL SECURITY;
CREATE POLICY recovery_read ON public.characterization_recovery FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.group_members g WHERE g.group_id=characterization_recovery.group_id AND g.user_id=(SELECT auth.uid()) AND g.status='active'));
CREATE POLICY recovery_insert ON public.characterization_recovery FOR INSERT TO authenticated WITH CHECK(created_by=(SELECT auth.uid()) AND
 EXISTS(SELECT 1 FROM public.group_members g WHERE g.group_id=characterization_recovery.group_id AND g.user_id=(SELECT auth.uid()) AND g.status='active'));
CREATE POLICY recovery_update ON public.characterization_recovery FOR UPDATE TO authenticated USING(
 EXISTS(SELECT 1 FROM public.group_members g WHERE g.group_id=characterization_recovery.group_id AND g.user_id=(SELECT auth.uid()) AND g.status='active')) WITH CHECK(
 EXISTS(SELECT 1 FROM public.group_members g WHERE g.group_id=characterization_recovery.group_id AND g.user_id=(SELECT auth.uid()) AND g.status='active'));
REVOKE ALL ON public.characterization_recovery FROM anon,authenticated;
GRANT SELECT,INSERT ON public.characterization_recovery TO authenticated;
GRANT UPDATE(cleanup_state,cleanup_receipt) ON public.characterization_recovery TO authenticated;

CREATE FUNCTION public.delete_characterization_recoverable(p_id uuid,p_group_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE snapshot jsonb;event public.characterization_recovery;removed uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.group_members WHERE group_id=p_group_id AND user_id=auth.uid() AND status='active') THEN
 RAISE EXCEPTION 'Active group membership required' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(c) INTO snapshot FROM public.sample_characterizations c JOIN public.samples s ON s.id=c.sample_id
 WHERE c.id=p_id AND s.group_id=p_group_id FOR UPDATE OF c;
 IF snapshot IS NULL THEN
 SELECT * INTO event FROM public.characterization_recovery WHERE record_id=p_id AND group_id=p_group_id ORDER BY deleted_at DESC LIMIT 1;
 IF event.id IS NULL THEN RAISE EXCEPTION 'Record not found in this group' USING ERRCODE='42501'; END IF;
 RETURN to_jsonb(event); END IF;
 INSERT INTO public.characterization_recovery(record_id,group_id,record_snapshot,created_by)
 VALUES(p_id,p_group_id,snapshot,auth.uid()) RETURNING * INTO event;
 DELETE FROM public.sample_characterizations WHERE id=p_id RETURNING id INTO removed;
 IF removed IS NULL THEN RAISE EXCEPTION 'Record cannot be deleted by this user' USING ERRCODE='42501'; END IF;
 RETURN to_jsonb(event);
END;$$;
REVOKE ALL ON FUNCTION public.delete_characterization_recoverable(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_characterization_recoverable(uuid,uuid) TO authenticated;
