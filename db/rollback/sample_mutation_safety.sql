-- Revert the application first. No sample rows are removed by this rollback.
DROP FUNCTION IF EXISTS public.create_sample_safe(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text);
DROP FUNCTION IF EXISTS public.delete_samples_safe(uuid,uuid,uuid[]);
DROP POLICY IF EXISTS sample_audit_insert_actor ON public.sample_audit_log;
-- Keep existing table grants: RLS continues to reject inserts without a policy.
