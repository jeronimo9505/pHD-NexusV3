import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';

export function useKnowledge() {
    const {
        knowledge: rawItems,
        activeGroupId,
        currentUser,
        refreshUserData
    } = useApp();

    const knowledge = useMemo(() => {
        if (!rawItems) return [];

        return rawItems.map(item => ({
            ...item,
            description: item.content, // Map content to description for component
            comments: item.comments?.map(c => ({
                id: c.id,
                text: c.text,
                date: c.created_at,
                author: c.author?.full_name || 'Sistema'
            })) || []
        }));
    }, [rawItems]);

    // Derived loading state
    const loading = !rawItems && activeGroupId; // Simple heuristic, or rely on AppContext loading

    const createKnowledgeItem = async (itemData) => {
        if (!activeGroupId || !currentUser) return { error: 'Missing data' };

        try {
            const { data, error } = await supabase.from('knowledge_items').insert({
                group_id: activeGroupId,
                created_by: currentUser.id,
                title: itemData.title,
                content: itemData.description || itemData.content || '',
                url: itemData.url || '',
                drive_file_id: itemData.drive_file_id || null,
                category: itemData.category || 'reference',
                tags: itemData.tags || [],
                is_pinned: itemData.is_pinned || false
            }).select().single();

            if (error) return { error };

            if (refreshUserData) await refreshUserData();
            return { data };
        } catch (err) {
            return { error: err.message };
        }
    };

    const updateKnowledgeItem = async (itemId, updates) => {
        try {
            const dbUpdates = { ...updates };
            if (dbUpdates.description !== undefined) {
                dbUpdates.content = dbUpdates.description;
                delete dbUpdates.description;
            }

            // Allow update of drive_file_id if passed
            if (dbUpdates.drive_file_id !== undefined) {
                // Should be fine as is since we spread updates, but explicit comment helps
            }

            const { error } = await supabase
                .from('knowledge_items')
                .update(dbUpdates)
                .eq('id', itemId);

            if (error) return { error };

            if (refreshUserData) await refreshUserData();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    const deleteKnowledgeItem = async (itemId) => {
        try {
            const { error } = await supabase
                .from('knowledge_items')
                .delete()
                .eq('id', itemId);

            if (error) return { error };

            if (refreshUserData) await refreshUserData();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    const addKnowledgeComment = async (itemId, text) => {
        if (!currentUser) return { error: 'Not authenticated' };
        try {
            const { error } = await supabase.from('knowledge_comments').insert({
                item_id: itemId,
                author_id: currentUser.id,
                text: text
            });

            if (error) return { error };

            if (refreshUserData) await refreshUserData();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    return {
        knowledge,
        loading,
        error: null,
        fetchKnowledge: refreshUserData,
        createKnowledgeItem,
        updateKnowledgeItem,
        deleteKnowledgeItem,
        addKnowledgeComment
    };
}
