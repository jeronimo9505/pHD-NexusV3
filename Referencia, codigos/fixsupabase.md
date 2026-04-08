-- Fix for policy_exists_rls_disabled
-- These tables already have policies but RLS was forgotten to be enabled
ALTER TABLE public.sample_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_fields_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_nomenclatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;

-- Fix for rls_disabled_in_public (The rest of the tables)
-- Enable RLS and create a basic SELECT policy so they don't break if queried
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Roles are viewable by authenticated users" ON public.roles FOR SELECT TO authenticated USING (true);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissions are viewable by authenticated users" ON public.permissions FOR SELECT TO authenticated USING (true);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Role permissions are viewable by authenticated users" ON public.role_permissions FOR SELECT TO authenticated USING (true);