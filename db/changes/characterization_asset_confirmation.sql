-- Update only the matching operation receipt, preserving concurrent scientific edits.
CREATE FUNCTION public.confirm_characterization_asset_operation(p_id uuid,p_group_id uuid,p_operation_id uuid,p_receipt jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE affected integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.group_members WHERE group_id=p_group_id AND user_id=auth.uid() AND status='active') THEN
 RAISE EXCEPTION 'Active group membership required' USING ERRCODE='42501'; END IF;
 IF p_receipt->>'operation_id' IS DISTINCT FROM p_operation_id::text THEN RAISE EXCEPTION 'Operation does not match'; END IF;
 UPDATE public.sample_characterizations c
 SET data=jsonb_set(c.data,'{asset_manifest,operation,receipt}',p_receipt,false)
 FROM public.samples s WHERE s.id=c.sample_id AND s.group_id=p_group_id AND c.id=p_id
 AND c.data#>>'{asset_manifest,operation,id}'=p_operation_id::text;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected=1;
END;$$;
REVOKE ALL ON FUNCTION public.confirm_characterization_asset_operation(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_characterization_asset_operation(uuid,uuid,uuid,jsonb) TO authenticated;
