-- Idempotent import, preserving existing session permissions and RLS.
CREATE FUNCTION public.import_wip_characterization_safe(
    p_group_id uuid, p_sample_id uuid, p_record_id uuid, p_data jsonb,
    p_type text, p_performed_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); existing_sample uuid; inserted_id uuid;
BEGIN
    IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id=p_group_id AND user_id=actor AND status='active')
        OR NOT EXISTS (SELECT 1 FROM public.samples WHERE id=p_sample_id AND group_id=p_group_id) THEN
        RAISE EXCEPTION 'Active membership and a sample in this group are required' USING ERRCODE='42501';
    END IF;
    IF p_type NOT IN ('Raman','Optical Image') OR p_data IS NULL OR jsonb_typeof(p_data)<>'object'
        OR length(p_data::text)>2000000
        OR COALESCE(p_data->'wip_import'->>'source_hash','') !~ '^[a-f0-9]{64}$'
        OR COALESCE(p_data->'wip_import'->>'object_id','') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid WIP import data' USING ERRCODE='22023';
    END IF;
    IF p_data ? 'raman_drive_sync' AND p_data->'raman_drive_sync'->>'owner_id' IS DISTINCT FROM actor::text THEN
        RAISE EXCEPTION 'Reference owner must match the importing user' USING ERRCODE='42501';
    END IF;
    IF p_type='Raman' AND (jsonb_typeof(p_data->'local_h5_paths') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'local_h5_paths')<>1) THEN
        RAISE EXCEPTION 'A local Raman dataset is required' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.sample_characterizations(id,sample_id,type,data,created_by,performed_at)
        VALUES(p_record_id,p_sample_id,p_type,p_data,actor,p_performed_at)
        ON CONFLICT(id) DO NOTHING RETURNING id INTO inserted_id;
    IF inserted_id IS NOT NULL THEN RETURN jsonb_build_object('id',inserted_id,'created',true); END IF;
    SELECT sample_id INTO existing_sample FROM public.sample_characterizations WHERE id=p_record_id;
    IF existing_sample IS DISTINCT FROM p_sample_id THEN
        RAISE EXCEPTION 'Import identifier belongs to a different sample' USING ERRCODE='42501';
    END IF;
    RETURN jsonb_build_object('id',p_record_id,'created',false);
END;
$$;
REVOKE ALL ON FUNCTION public.import_wip_characterization_safe(uuid,uuid,uuid,jsonb,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_wip_characterization_safe(uuid,uuid,uuid,jsonb,text,timestamptz) TO authenticated;
