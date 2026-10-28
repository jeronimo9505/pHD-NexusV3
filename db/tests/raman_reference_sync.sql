BEGIN;
-- Pick an existing active actor; every temporary change below is rolled back.
SELECT set_config('request.jwt.claim.sub', (
    SELECT m.user_id::text FROM public.group_members m
    JOIN public.samples s ON s.group_id = m.group_id
    JOIN public.sample_characterizations c ON c.sample_id = s.id AND c.created_by = m.user_id
    WHERE m.status = 'active' AND c.type = 'Raman' LIMIT 1
), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
    record_id uuid;
    group_id uuid;
    before_data jsonb;
    result jsonb;
    after_data jsonb;
BEGIN
    SELECT c.id, s.group_id, c.data INTO record_id, group_id, before_data
    FROM public.sample_characterizations c JOIN public.samples s ON s.id=c.sample_id
    WHERE c.type='Raman' AND c.created_by=auth.uid() LIMIT 1;
    IF record_id IS NULL THEN RAISE EXCEPTION 'No authorized Raman fixture'; END IF;
    UPDATE public.sample_characterizations SET data=COALESCE(before_data,'{}'::jsonb) || jsonb_build_object(
        'raman_spectrum_file_id','old-reference', 'probe_preserve','retained',
        'raman_drive_sync',jsonb_build_object('job_id','probe-job','owner_id',auth.uid()::text,
            'status','pending','payload',jsonb_build_object('data',repeat('x',20000)))) WHERE id=record_id;
    result := public.update_raman_reference_sync_safe(group_id,record_id,'probe-job','reserved-reference',false);
    IF result->>'fileId' <> 'reserved-reference' THEN RAISE EXCEPTION 'Reservation failed'; END IF;
    result := public.update_raman_reference_sync_safe(group_id,record_id,'probe-job','different-reference',false);
    IF result->>'fileId' <> 'reserved-reference' THEN RAISE EXCEPTION 'Reservation was replaced'; END IF;
    UPDATE public.sample_characterizations SET data=data || '{"concurrent_edit":"preserved"}'::jsonb WHERE id=record_id;
    result := public.update_raman_reference_sync_safe(group_id,record_id,'stale-job','reserved-reference',true);
    IF result->>'stale' <> 'true' THEN RAISE EXCEPTION 'Stale job accepted'; END IF;
    result := public.update_raman_reference_sync_safe(group_id,record_id,'probe-job','wrong-reference',true);
    IF result->>'stale' <> 'true' THEN RAISE EXCEPTION 'Wrong reference accepted'; END IF;
    result := public.update_raman_reference_sync_safe(group_id,record_id,'probe-job','reserved-reference',true);
    SELECT data INTO after_data FROM public.sample_characterizations WHERE id=record_id;
    IF after_data->>'raman_spectrum_file_id' <> 'reserved-reference'
        OR after_data->>'concurrent_edit' <> 'preserved' OR after_data->>'probe_preserve' <> 'retained'
        OR after_data->'raman_drive_sync'->>'status' <> 'synced'
        OR after_data->'raman_drive_sync' ? 'payload' THEN RAISE EXCEPTION 'Confirmation failed'; END IF;
    BEGIN
        PERFORM public.update_raman_reference_sync_safe('00000000-0000-0000-0000-000000000000',record_id,'probe-job','reference',true);
        RAISE EXCEPTION 'Cross-group call accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
ROLLBACK;
