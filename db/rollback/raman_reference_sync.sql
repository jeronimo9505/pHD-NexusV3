-- Revert the application first. Keeps all characterizations and pending data.
DROP FUNCTION IF EXISTS public.update_raman_reference_sync_safe(uuid, uuid, text, text, boolean);
