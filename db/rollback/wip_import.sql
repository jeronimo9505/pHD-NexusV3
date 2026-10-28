-- Revert the application first. Existing imported records and files remain.
DROP FUNCTION IF EXISTS public.import_wip_characterization_safe(uuid,uuid,uuid,jsonb,text,timestamptz);
