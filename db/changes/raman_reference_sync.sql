-- Additive RPC. Existing rows are unchanged. Keep session privileges and RLS.
CREATE FUNCTION public.update_raman_reference_sync_safe(
    p_group_id uuid, p_id uuid, p_job_id text, p_file_id text, p_complete boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    actor uuid := auth.uid();
    snapshot jsonb;
    job jsonb;
    updated jsonb;
BEGIN
    IF actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = actor AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Active group membership required' USING ERRCODE = '42501';
    END IF;
    IF p_job_id IS NULL OR p_job_id !~ '^[a-zA-Z0-9_-]{1,100}$'
        OR p_file_id IS NULL OR p_file_id !~ '^[a-zA-Z0-9_-]{1,200}$' THEN
        RAISE EXCEPTION 'Invalid reference identifier' USING ERRCODE = '22023';
    END IF;
    SELECT c.data INTO snapshot
    FROM public.sample_characterizations c JOIN public.samples s ON s.id = c.sample_id
    WHERE c.id = p_id AND s.group_id = p_group_id AND c.type = 'Raman'
    FOR UPDATE OF c;
    job := snapshot->'raman_drive_sync';
    IF NOT FOUND OR job->>'job_id' IS DISTINCT FROM p_job_id
        OR job->>'owner_id' IS DISTINCT FROM actor::text OR job->>'status' IS DISTINCT FROM 'pending' THEN
        RETURN jsonb_build_object('stale', true);
    END IF;
    IF NOT COALESCE(p_complete, false) AND NULLIF(job->>'file_id', '') IS NOT NULL THEN
        RETURN jsonb_build_object('fileId', job->>'file_id');
    END IF;
    IF COALESCE(p_complete, false) THEN
        IF job->>'file_id' IS DISTINCT FROM p_file_id THEN RETURN jsonb_build_object('stale', true); END IF;
        updated := snapshot || jsonb_build_object('raman_spectrum_file_id', p_file_id, 'raman_drive_sync',
            jsonb_build_object('job_id', p_job_id, 'owner_id', actor::text, 'file_id', p_file_id,
                'status', 'synced', 'synced_at', clock_timestamp()));
    ELSE
        updated := jsonb_set(snapshot, '{raman_drive_sync}', job || jsonb_build_object('file_id', p_file_id));
    END IF;
    UPDATE public.sample_characterizations SET data = updated WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reference update rejected' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('fileId', p_file_id);
END;
$$;
REVOKE ALL ON FUNCTION public.update_raman_reference_sync_safe(uuid, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_raman_reference_sync_safe(uuid, uuid, text, text, boolean) TO authenticated;
