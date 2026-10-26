-- Additive, session/RLS preserving mutation RPCs. No existing sample is changed.
CREATE POLICY sample_audit_insert_actor ON public.sample_audit_log
FOR INSERT TO authenticated WITH CHECK (
    user_id = (SELECT auth.uid()) AND action IN ('create', 'update') AND EXISTS (
        SELECT 1 FROM public.samples s JOIN public.group_members gm ON gm.group_id = s.group_id
        WHERE s.id = sample_id AND gm.user_id = (SELECT auth.uid()) AND gm.status = 'active'
        AND (action <> 'create' OR s.created_by = (SELECT auth.uid()))
    )
);
GRANT INSERT ON public.sample_audit_log TO authenticated;

CREATE FUNCTION public.create_sample_safe(
    p_group_id uuid, p_logbook_id uuid, p_request_id uuid, p_parent_id uuid,
    p_type text, p_attributes jsonb, p_composition jsonb, p_description text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    actor uuid := auth.uid();
    result public.samples%ROWTYPE;
    parent public.samples%ROWTYPE;
    prefix text;
    code_prefix text;
    code text;
    next_index numeric;
    new_level integer := 0;
BEGIN
    IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = actor AND status = 'active') THEN
        RAISE EXCEPTION 'Active group membership required' USING ERRCODE = '42501';
    END IF;
    IF p_request_id IS NULL OR p_type NOT IN ('stock', 'derived')
       OR jsonb_typeof(p_attributes) IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_composition) IS DISTINCT FROM 'array'
       OR (p_parent_id IS NULL) <> (p_type = 'stock') THEN
        RAISE EXCEPTION 'Invalid sample draft' USING ERRCODE = '22023';
    END IF;
    -- Serialize code allocation and deletion within a group. Existing unique
    -- constraints remain the final guard, including older clients.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_group_id::text, 0));
    SELECT * INTO result FROM public.samples WHERE id = p_request_id;
    IF FOUND THEN
        IF result.created_by IS DISTINCT FROM actor OR result.group_id IS DISTINCT FROM p_group_id
           OR result.logbook_id IS DISTINCT FROM p_logbook_id THEN
            RAISE EXCEPTION 'Request identifier already used' USING ERRCODE = '42501';
        END IF;
        IF result.parent_id IS DISTINCT FROM p_parent_id OR result.type IS DISTINCT FROM p_type
           OR result.attributes IS DISTINCT FROM p_attributes OR result.composition IS DISTINCT FROM p_composition
           OR coalesce(result.description, '') IS DISTINCT FROM coalesce(p_description, '') THEN
            RAISE EXCEPTION 'This draft was already saved. Refresh the list before editing that sample.' USING ERRCODE = '22023';
        END IF;
    ELSE
        SELECT l.prefix INTO prefix FROM public.logbooks l WHERE l.id = p_logbook_id AND l.group_id = p_group_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Logbook not found in this group' USING ERRCODE = '22023'; END IF;
        IF p_parent_id IS NOT NULL THEN
            SELECT * INTO parent FROM public.samples WHERE id = p_parent_id AND group_id = p_group_id AND logbook_id = p_logbook_id FOR KEY SHARE;
            IF NOT FOUND THEN RAISE EXCEPTION 'Parent sample not found in this logbook' USING ERRCODE = '22023'; END IF;
            new_level := coalesce(parent.level, 0) + 1;
            code_prefix := coalesce(parent.sample_code, parent.display_id) || '-' ||
                CASE new_level WHEN 1 THEN 'c' WHEN 2 THEN 'g' ELSE (new_level - 1)::text || 'g' END;
        ELSE code_prefix := coalesce(nullif(prefix, ''), 'S'); END IF;
        SELECT coalesce(max(substring(c.value FROM length(code_prefix) + 1)::numeric), 0) + 1 INTO next_index
        FROM public.samples s CROSS JOIN LATERAL (VALUES (s.sample_code), (s.display_id)) AS c(value)
        WHERE s.group_id = p_group_id AND left(c.value, length(code_prefix)) = code_prefix
            AND substring(c.value FROM length(code_prefix) + 1) ~ '^[0-9]+$';
        code := code_prefix || next_index::text;
        INSERT INTO public.samples(id, group_id, logbook_id, display_id, sample_code, name, parent_id,
            level, type, status, attributes, composition, description, created_by)
        VALUES (p_request_id, p_group_id, p_logbook_id, code, code,
            coalesce((SELECT string_agg(item->>'code', '-' ORDER BY ord) FROM jsonb_array_elements(p_composition) WITH ORDINALITY AS x(item, ord)), 'New Sample'),
            p_parent_id, new_level, p_type, 'active', p_attributes, p_composition, coalesce(p_description, ''), actor)
        RETURNING * INTO result;
        INSERT INTO public.sample_audit_log(sample_id, user_id, action, changes)
        VALUES (result.id, actor, 'create', jsonb_build_object('initial', to_jsonb(result)));
    END IF;
    RETURN to_jsonb(result) || jsonb_build_object(
        'characterization_types', '[]'::jsonb, 'characterization_refs', '[]'::jsonb,
        'parent', (SELECT jsonb_build_object('id', s.id, 'display_id', s.display_id) FROM public.samples s WHERE s.id = result.parent_id),
        'created_by_user', (SELECT jsonb_build_object('full_name', p.full_name, 'email', p.email) FROM public.profiles p WHERE p.id = actor)
    );
END;
$$;

CREATE FUNCTION public.delete_samples_safe(p_group_id uuid, p_logbook_id uuid, p_sample_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); wanted uuid[]; removed uuid[]; count_found integer;
BEGIN
    IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = actor AND status = 'active') THEN
        RAISE EXCEPTION 'Active group membership required' USING ERRCODE = '42501';
    END IF;
    SELECT array_agg(DISTINCT id) INTO wanted FROM unnest(p_sample_ids) AS x(id) WHERE id IS NOT NULL;
    IF coalesce(cardinality(wanted), 0) = 0 OR cardinality(wanted) > 500 THEN
        RAISE EXCEPTION 'Select between 1 and 500 samples' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_group_id::text, 0));
    PERFORM 1 FROM public.samples WHERE id = ANY(wanted) AND group_id = p_group_id AND logbook_id = p_logbook_id ORDER BY id FOR UPDATE;
    GET DIAGNOSTICS count_found = ROW_COUNT;
    IF count_found <> cardinality(wanted) THEN
        RAISE EXCEPTION 'Some samples no longer exist or cannot be accessed. Refresh and try again.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.samples WHERE parent_id = ANY(wanted) AND NOT (id = ANY(wanted))) THEN
        RAISE EXCEPTION 'Some selected samples have derived samples. Select the whole family or archive the parent.' USING ERRCODE = '22023';
    END IF;
    WITH deleted AS (DELETE FROM public.samples WHERE id = ANY(wanted) AND group_id = p_group_id AND logbook_id = p_logbook_id RETURNING id)
    SELECT array_agg(id) INTO removed FROM deleted;
    IF coalesce(cardinality(removed), 0) <> cardinality(wanted) THEN
        RAISE EXCEPTION 'Not all selected samples could be deleted' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('deleted_ids', to_jsonb(removed));
END;
$$;

REVOKE ALL ON FUNCTION public.create_sample_safe(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_samples_safe(uuid,uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sample_safe(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_samples_safe(uuid,uuid,uuid[]) TO authenticated;
