BEGIN;
-- Use an existing active membership only as an authorization fixture. All
-- sample/audit rows made by these tests have fresh IDs and are rolled back.
SELECT set_config('test.sample_group', gm.group_id::text, true),
       set_config('test.sample_actor', gm.user_id::text, true),
       set_config('test.sample_book', l.id::text, true),
       set_config('request.jwt.claim.sub', gm.user_id::text, true)
FROM public.group_members gm JOIN public.logbooks l ON l.group_id = gm.group_id
WHERE gm.status = 'active' ORDER BY l.created_at LIMIT 1;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
    g uuid := current_setting('test.sample_group')::uuid;
    b uuid := current_setting('test.sample_book')::uuid;
    actor uuid := current_setting('test.sample_actor')::uuid;
    root_id uuid := gen_random_uuid(); child_id uuid := gen_random_uuid(); second_id uuid := gen_random_uuid();
    first jsonb; again jsonb; child jsonb; second jsonb; deleted jsonb; total integer;
BEGIN
    first := public.create_sample_safe(g,b,root_id,NULL,'stock','{}','[]','test draft');
    again := public.create_sample_safe(g,b,root_id,NULL,'stock','{}','[]','test draft');
    IF first->>'id' <> again->>'id' THEN RAISE EXCEPTION 'Retry created another sample'; END IF;
    SELECT count(*) INTO total FROM public.samples WHERE id = root_id;
    IF total <> 1 THEN RAISE EXCEPTION 'Duplicate draft row'; END IF;
    SELECT count(*) INTO total FROM public.sample_audit_log WHERE sample_id = root_id AND action = 'create';
    IF total <> 1 THEN RAISE EXCEPTION 'Creation must have one confirmed audit row'; END IF;
    BEGIN
        PERFORM public.create_sample_safe(g,b,root_id,NULL,'stock','{}','[]','changed draft');
        RAISE EXCEPTION 'Changed request was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    second := public.create_sample_safe(g,b,second_id,NULL,'stock','{}','[]','second draft');
    IF first->>'sample_code' = second->>'sample_code' THEN RAISE EXCEPTION 'Sample code collision'; END IF;
    child := public.create_sample_safe(g,b,child_id,root_id,'derived','{}','[]','child draft');
    IF child->>'sample_code' <> (first->>'sample_code') || '-c1' THEN RAISE EXCEPTION 'Incorrect derived numbering'; END IF;
    BEGIN
        PERFORM public.delete_samples_safe(g,b,ARRAY[root_id]);
        RAISE EXCEPTION 'Parent deleted without derived samples';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN
        PERFORM public.delete_samples_safe(g,b,ARRAY[second_id,gen_random_uuid()]);
        RAISE EXCEPTION 'Missing record produced a successful partial deletion';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF NOT EXISTS(SELECT 1 FROM public.samples WHERE id=second_id) THEN RAISE EXCEPTION 'Partial deletion escaped rollback'; END IF;
    BEGIN
        INSERT INTO public.sample_audit_log(sample_id,user_id,action,changes) VALUES(root_id,gen_random_uuid(),'update','{}');
        RAISE EXCEPTION 'Another audit actor was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
    BEGIN
        PERFORM public.create_sample_safe(g,b,gen_random_uuid(),NULL,'stock','{}','[]','unauthorized');
        RAISE EXCEPTION 'Inactive/nonmember created sample';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM set_config('request.jwt.claim.sub',actor::text,true);
    deleted := public.delete_samples_safe(g,b,ARRAY[root_id,child_id]);
    IF jsonb_array_length(deleted->'deleted_ids') <> 2 OR EXISTS(SELECT 1 FROM public.samples WHERE id=ANY(ARRAY[root_id,child_id])) THEN
        RAISE EXCEPTION 'Complete family deletion failed';
    END IF;
    IF has_function_privilege('anon','public.create_sample_safe(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)','EXECUTE') THEN
        RAISE EXCEPTION 'Anonymous creation is callable';
    END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS sample RPC: draft retry, numbering, audit actor, active membership, protected families and atomic deletion; test data rolled back' AS result;
