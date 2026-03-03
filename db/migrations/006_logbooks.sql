-- 1. Create logbooks table
CREATE TABLE IF NOT EXISTS public.logbooks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(group_id, prefix)
);

-- Enable RLS
ALTER TABLE public.logbooks ENABLE ROW LEVEL SECURITY;

-- Policies for logbooks
CREATE POLICY "Logbooks viewable by group members" ON public.logbooks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = logbooks.group_id
            AND group_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Logbooks editable by group admins" ON public.logbooks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = logbooks.group_id
            AND group_members.user_id = auth.uid()
            AND group_members.role IN ('supervisor', 'labmanager', 'owner')
        )
    );
-- Allow creation by authenticated users (to allow initial creation)
CREATE POLICY "Logbooks createable by authenticated users" ON public.logbooks
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2. Add logbook_id to existing tables
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS logbook_id UUID REFERENCES public.logbooks(id) ON DELETE CASCADE;
ALTER TABLE public.sample_nomenclatures ADD COLUMN IF NOT EXISTS logbook_id UUID REFERENCES public.logbooks(id) ON DELETE CASCADE;
ALTER TABLE public.sample_fields_config ADD COLUMN IF NOT EXISTS logbook_id UUID REFERENCES public.logbooks(id) ON DELETE CASCADE;

-- 3. Backfill default logbook for existing groups
DO $$
DECLARE
    g RECORD;
    l_id UUID;
BEGIN
    FOR g IN SELECT id FROM public.groups LOOP
        -- Check if default logbook exists, if not create it
        INSERT INTO public.logbooks (group_id, name, prefix, description)
        VALUES (g.id, 'Samples Logbook', 'S', 'Default samples logbook')
        ON CONFLICT (group_id, prefix) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO l_id;

        -- Update existing data for this group
        UPDATE public.samples SET logbook_id = l_id WHERE group_id = g.id AND logbook_id IS NULL;
        UPDATE public.sample_nomenclatures SET logbook_id = l_id WHERE group_id = g.id AND logbook_id IS NULL;
        UPDATE public.sample_fields_config SET logbook_id = l_id WHERE group_id = g.id AND logbook_id IS NULL;
    END LOOP;
END $$;
