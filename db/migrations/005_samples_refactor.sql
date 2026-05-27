-- 1. Add new columns to samples
alter table public.samples 
    add column if not exists sample_code text,
    add column if not exists name text not null default '',
    add column if not exists composition jsonb not null default '[]'::jsonb;

-- Ensure sample_code is unique per group
alter table public.samples add constraint samples_group_id_sample_code_key unique (group_id, sample_code);

-- 2. Create sample_characterizations table
create table if not exists public.sample_characterizations (
    id uuid not null default uuid_generate_v4() primary key,
    sample_id uuid not null references public.samples(id) on delete cascade,
    type text not null, -- e.g. 'Raman', 'AFM', 'SEM'
    data jsonb not null default '{}'::jsonb, -- Technical data: power, time, etc.
    images text[], -- Array of storage paths or URLs
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

-- Enable RLS for characterizations
alter table public.sample_characterizations enable row level security;

create policy "Characterizations viewable by group members" on public.sample_characterizations
    for select using (
        exists (
            select 1 from public.samples
            join public.group_members on group_members.group_id = samples.group_id
            where samples.id = sample_characterizations.sample_id
            and group_members.user_id = auth.uid()
        )
    );

create policy "Characterizations editable by group members" on public.sample_characterizations
    for all using (
        exists (
            select 1 from public.samples
            join public.group_members on group_members.group_id = samples.group_id
            where samples.id = sample_characterizations.sample_id
            and group_members.user_id = auth.uid()
            and group_members.role in ('supervisor', 'labmanager', 'owner', 'researcher')
        )
    );

-- 3. Create a sequence for simple sample codes (optional, can be used by app)
-- Scoped sequences in Postgres are complex with RLS. 
-- We'll handle "S-001" generation in the application logic using count+1 or a separate counter table if needed.
-- For now, no sequence.
