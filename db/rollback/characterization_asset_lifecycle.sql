-- Revert the application first. Keep characterization_recovery: it contains user recovery snapshots.
-- Do not drop this table as part of a code rollback.
DROP FUNCTION IF EXISTS public.delete_characterization_recoverable(uuid,uuid);
DROP FUNCTION IF EXISTS public.confirm_characterization_asset_operation(uuid,uuid,uuid,jsonb);
