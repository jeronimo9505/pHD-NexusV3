import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';

export function useKnowledge() {
    const { activeGroupId, currentUser } = useApp();
    const [knowledge, setKnowledge] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchKnowledge = useCallback(async () => {
        if (!activeGroupId) return;

        try {
            console.log(`[useKnowledge] Fetching knowledge for group: ${activeGroupId}`);
            setLoading(true);

            // Get items with comments
            const { data, error } = await supabase
                .from('knowledge_items')
                .select(`
                    *,
                    comments:knowledge_comments(
                        id,
                        text,
                        created_at,
                        author:profiles(full_name)
                    )
                `)
                .eq('group_id', activeGroupId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('[useKnowledge] Supabase fetch error:', error);
                throw error;
            }

            // Map data to expected frontend format (description -> content)
            const formattedData = data.map(item => ({
                ...item,
                description: item.content, // Map content to description for component
                comments: item.comments?.map(c => ({
                    id: c.id,
                    text: c.text,
                    date: c.created_at,
                    author: c.author?.full_name || 'Sistema'
                })) || []
            }));

            console.log('[useKnowledge] Fetch success:', formattedData);
            setKnowledge(formattedData || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching knowledge:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [activeGroupId]);

    useEffect(() => {
        fetchKnowledge();
    }, [fetchKnowledge]);

    const createKnowledgeItem = async (itemData) => {
        if (!activeGroupId || !currentUser) return { error: 'Missing data' };

        try {
            const { data, error } = await supabase.from('knowledge_items').insert({
                group_id: activeGroupId,
                created_by: currentUser.id,
                title: itemData.title,
                content: itemData.description || itemData.content || '', // Handle mapping
                url: itemData.url || '',
                category: itemData.category || 'reference',
                tags: itemData.tags || [],
                is_pinned: itemData.is_pinned || false
            }).select().single();

            if (error) return { error };

            await fetchKnowledge();
            return { data };
        } catch (err) {
            return { error: err.message };
        }
    };

    const updateKnowledgeItem = async (itemId, updates) => {
        try {
            // Handle mapping description -> content
            const dbUpdates = { ...updates };
            if (dbUpdates.description !== undefined) {
                dbUpdates.content = dbUpdates.description;
                delete dbUpdates.description;
            }

            const { error } = await supabase
                .from('knowledge_items')
                .update(dbUpdates)
                .eq('id', itemId);

            if (error) return { error };

            await fetchKnowledge();
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

            await fetchKnowledge();
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

            await fetchKnowledge();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    return {
        knowledge,
        loading,
        error,
        fetchKnowledge,
        createKnowledgeItem,
        updateKnowledgeItem,
        deleteKnowledgeItem,
        addKnowledgeComment
    };
}
