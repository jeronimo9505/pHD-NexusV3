BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT gm.user_id::text FROM public.group_members gm JOIN public.samples s ON s.group_id=gm.group_id AND s.created_by=gm.user_id WHERE gm.status='active' LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE sid uuid;gid uuid;rid uuid:=gen_random_uuid();result jsonb;again jsonb;snapshot jsonb;
BEGIN
 SELECT s.id,s.group_id INTO sid,gid FROM public.samples s JOIN public.group_members gm ON gm.group_id=s.group_id WHERE gm.user_id=auth.uid() AND gm.status='active' LIMIT 1;
 INSERT INTO public.sample_characterizations(id,sample_id,type,data,created_by) VALUES(rid,sid,'Raman','{"Laser":"632.799987 nm","local_h5_paths":["test/file.h5"],"asset_manifest":{"version":1}}',auth.uid());
 BEGIN
 PERFORM public.delete_characterization_recoverable(rid,'00000000-0000-0000-0000-000000000000');RAISE EXCEPTION 'Cross-group deletion accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 result:=public.delete_characterization_recoverable(rid,gid);
 IF EXISTS(SELECT 1 FROM public.sample_characterizations WHERE id=rid) THEN RAISE EXCEPTION 'Record was not deleted';END IF;
 IF result->'record_snapshot'->'data'->>'Laser'<>'632.799987 nm' THEN RAISE EXCEPTION 'Original metadata was lost';END IF;
 IF result->>'cleanup_state'<>'pending' THEN RAISE EXCEPTION 'Cleanup was not queued';END IF;
 again:=public.delete_characterization_recoverable(rid,gid);
 IF result->>'id'<>again->>'id' THEN RAISE EXCEPTION 'Retry created a second deletion event';END IF;
 UPDATE public.characterization_recovery SET cleanup_state='quarantined',cleanup_receipt='{"files":[]}' WHERE id=(result->>'id')::uuid;
 BEGIN
 UPDATE public.characterization_recovery SET record_snapshot='{}' WHERE id=(result->>'id')::uuid;RAISE EXCEPTION 'Recovery snapshot can be overwritten';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 SELECT record_snapshot INTO snapshot FROM public.characterization_recovery WHERE id=(result->>'id')::uuid;
 INSERT INTO public.sample_characterizations(id,sample_id,type,data,created_by) VALUES(rid,sid,snapshot->>'type',snapshot->'data',auth.uid());
 IF NOT EXISTS(SELECT 1 FROM public.sample_characterizations WHERE id=rid AND data->>'Laser'='632.799987 nm') THEN RAISE EXCEPTION 'Restoration failed';END IF;
 UPDATE public.sample_characterizations SET data=jsonb_set(data,'{asset_manifest,operation}','{"id":"11111111-1111-1111-1111-111111111111","receipt":{}}') WHERE id=rid;
 IF NOT public.confirm_characterization_asset_operation(rid,gid,'11111111-1111-1111-1111-111111111111','{"operation_id":"11111111-1111-1111-1111-111111111111","state":"committed"}') THEN RAISE EXCEPTION 'Confirmation failed';END IF;
 IF public.confirm_characterization_asset_operation(rid,gid,'22222222-2222-2222-2222-222222222222','{"operation_id":"22222222-2222-2222-2222-222222222222","state":"committed"}') THEN RAISE EXCEPTION 'Stale operation overwrote newer receipt';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sample_characterizations WHERE id=rid AND data->>'Laser'='632.799987 nm' AND data#>>'{asset_manifest,operation,receipt,state}'='committed') THEN RAISE EXCEPTION 'Confirmation lost scientific metadata';END IF;
END;$$;
ROLLBACK;
