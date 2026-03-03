-- Enable RLS
alter table if exists public.samples enable row level security;
alter table if exists public.sample_nomenclatures enable row level security;
alter table if exists public.sample_fields_config enable row level security;

-- 1. samples table
create table if not exists public.samples (
    id uuid not null default uuid_generate_v4() primary key,
    group_id uuid not null references public.groups(id) on delete cascade,
    display_id text not null,
    parent_id uuid references public.samples(id) on delete set null,
    type text not null check (type in ('stock', 'derived')),
    status text not null default 'active',
    attributes jsonb not null default '{}'::jsonb,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    
    unique(group_id, display_id)
);

-- 2. sample_nomenclatures table (Dictionary)
create table if not exists public.sample_nomenclatures (
    id uuid not null default uuid_generate_v4() primary key,
    group_id uuid not null references public.groups(id) on delete cascade,
    category text not null, -- e.g. "Substrate", "Material"
    code text not null, -- e.g. "Si"
    name text not null, -- e.g. "Silicon"
    
    unique(group_id, category, code)
);

-- 3. sample_fields_config (Dynamic Columns)
create table if not exists public.sample_fields_config (
    id uuid not null default uuid_generate_v4() primary key,
    group_id uuid not null references public.groups(id) on delete cascade,
    name text not null, -- internal key, e.g. "substrate"
    label text not null, -- e.g. "Sustrato"
    type text not null check (type in ('text', 'number', 'select', 'date', 'nomenclature', 'boolean', 'rich-text')),
    options jsonb, -- for select/nomenclature categories
    required boolean not null default false,
    "order" integer not null default 0,
    
    unique(group_id, name)
);

-- RLS Policies

-- samples: viewable by group members, editable by group members (for now, maybe restrict later)
create policy "Samples are viewable by group members" on public.samples
    for select using (
        exists (
            select 1 from public.group_members
            where group_members.group_id = samples.group_id
            and group_members.user_id = auth.uid()
        )
    );

create policy "Samples are editable by group members" on public.samples
    for all using (
        exists (
            select 1 from public.group_members
            where group_members.group_id = samples.group_id
            and group_members.user_id = auth.uid()
        )
    );

-- nomenclatures: viewable by group members, editable by group admins
create policy "Nomenclatures viewable by members" on public.sample_nomenclatures
    for select using (
        exists (
            select 1 from public.group_members
            where group_members.group_id = sample_nomenclatures.group_id
            and group_members.user_id = auth.uid()
        )
    );

create policy "Nomenclatures editable by admins" on public.sample_nomenclatures
    for all using (
        exists (
            select 1 from public.group_members
            where group_members.group_id = sample_nomenclatures.group_id
            and group_members.user_id = auth.uid()
            and group_members.role in ('supervisor', 'labmanager', 'owner')
        )
    );

-- fields config: viewable by members, editable by admins
create policy "Fields config viewable by members" on public.sample_fields_config
    for select using (
        exists (
            select 1 from public.group_members
            where group_members.group_id = sample_fields_config.group_id
            and group_members.user_id = auth.uid()
        )
    );

create policy "Fields config editable by admins" on public.sample_fields_config
    for all using (
        exists (
            select 1 from public.group_members
            where group_members.group_id = sample_fields_config.group_id
            and group_members.user_id = auth.uid()
            and group_members.role in ('supervisor', 'labmanager', 'owner')
        )
    );

-- 4. sample_audit_log (Traceability)
create table if not exists public.sample_audit_log (
    id uuid not null default uuid_generate_v4() primary key,
    sample_id uuid not null references public.samples(id) on delete cascade,
    user_id uuid references public.profiles(id),
    action text not null, -- 'create', 'update', 'delete'
    changes jsonb, -- { old: ..., new: ... }
    created_at timestamptz not null default now()
);

-- Audit log viewable by members (read-only)
create policy "Audit log viewable by members" on public.sample_audit_log
    for select using (
        exists (
            select 1 from public.samples
            join public.group_members on group_members.group_id = samples.group_id
            where samples.id = sample_audit_log.sample_id
            and group_members.user_id = auth.uid()
        )
    );
