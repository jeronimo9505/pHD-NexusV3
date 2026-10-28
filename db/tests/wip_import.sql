BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT gm.user_id::text FROM public.group_members gm
    JOIN public.samples s ON s.group_id=gm.group_id AND s.created_by=gm.user_id WHERE gm.status='active' LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE sid uuid;gid uuid;rid uuid:=gen_random_uuid();result jsonb;payload jsonb;stored jsonb;
BEGIN
    SELECT s.id,s.group_id INTO sid,gid FROM public.samples s JOIN public.group_members gm ON gm.group_id=s.group_id
        WHERE gm.user_id=auth.uid() AND gm.status='active' LIMIT 1;
    IF sid IS NULL THEN RAISE EXCEPTION 'No active sample fixture'; END IF;
    payload:=jsonb_build_object('local_h5_paths',jsonb_build_array('test/wip.h5'),'wip_import',jsonb_build_object(
        'source_hash',repeat('a',64),'object_id','35','original_metadata',jsonb_build_object('integration_time_s',3)));
    result:=public.import_wip_characterization_safe(gid,sid,rid,payload,'Raman',NULL);
    IF result->>'created'<>'true' THEN RAISE EXCEPTION 'Import was not created'; END IF;
    result:=public.import_wip_characterization_safe(gid,sid,rid,payload||'{"changed":true}'::jsonb,'Raman',NULL);
    IF result->>'created'<>'false' THEN RAISE EXCEPTION 'Duplicate import was created'; END IF;
    SELECT data INTO stored FROM public.sample_characterizations WHERE id=rid;
    IF stored ? 'changed' THEN RAISE EXCEPTION 'Retry overwrote existing metadata'; END IF;
    BEGIN
        PERFORM public.import_wip_characterization_safe('00000000-0000-0000-0000-000000000000',sid,gen_random_uuid(),payload,'Raman',NULL);
        RAISE EXCEPTION 'Cross-group import accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        PERFORM public.import_wip_characterization_safe(gid,sid,gen_random_uuid(),payload||jsonb_build_object('raman_drive_sync',jsonb_build_object('owner_id','another-user')),'Raman',NULL);
        RAISE EXCEPTION 'Wrong reference owner accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
ROLLBACK;
