-- Migration: Add Notion/OneNote-style logbook documents table
-- Creates logbook_documents table for collaborative research documents

CREATE TABLE IF NOT EXISTS public.logbook_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Page',
    content TEXT NOT NULL DEFAULT '',
    is_starred BOOLEAN NOT NULL DEFAULT false,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_logbook_documents_group ON public.logbook_documents(group_id);
CREATE INDEX IF NOT EXISTS idx_logbook_documents_user ON public.logbook_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_logbook_documents_updated ON public.logbook_documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_logbook_documents_starred ON public.logbook_documents(is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_logbook_documents_pinned ON public.logbook_documents(is_pinned) WHERE is_pinned = true;

-- Auto-update updated_at trigger
CREATE OR REPLACE TRIGGER update_logbook_documents_updated_at
    BEFORE UPDATE ON public.logbook_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row-Level Security
ALTER TABLE public.logbook_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Group members can view documents" ON public.logbook_documents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = logbook_documents.group_id
            AND group_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Group members can insert documents" ON public.logbook_documents
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = logbook_documents.group_id
            AND group_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Group members can update documents" ON public.logbook_documents
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = logbook_documents.group_id
            AND group_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Group members can delete documents" ON public.logbook_documents
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = logbook_documents.group_id
            AND group_members.user_id = auth.uid()
        )
    );
