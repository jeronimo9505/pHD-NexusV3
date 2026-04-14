-- Migration to add Raman Workspaces (Saved Comparisons)
CREATE TABLE IF NOT EXISTS public.raman_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    files JSONB NOT NULL DEFAULT '[]', -- Stores array of VaultFile objects
    settings JSONB NOT NULL DEFAULT '{}', -- Stores heatmap settings (range, scales, etc.)
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.raman_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workspaces in their groups"
ON public.raman_workspaces FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = raman_workspaces.group_id
        AND group_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create workspaces in their groups"
ON public.raman_workspaces FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = raman_workspaces.group_id
        AND group_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their own workspaces"
ON public.raman_workspaces FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own workspaces"
ON public.raman_workspaces FOR DELETE
USING (auth.uid() = created_by);

-- Trigger for updated_at
CREATE TRIGGER set_updated_at_raman_workspaces
BEFORE UPDATE ON public.raman_workspaces
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
