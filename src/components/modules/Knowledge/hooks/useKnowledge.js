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
            const { data, error } = await supabase
                .from('knowledge_items')
                .select('*')
                .eq('group_id', activeGroupId);

            if (error) {
                console.error('[useKnowledge] Supabase fetch error:', error);
                throw error;
            }

            console.log('[useKnowledge] Fetch success:', data);
            setKnowledge(data || []);
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
                content: itemData.content || '',
                url: itemData.url || '', // Include URL
                category: itemData.category || 'general',
                tags: itemData.tags || []
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
            const { error } = await supabase
                .from('knowledge_items')
                .update(updates)
                .eq('id', itemId);

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
        deleteKnowledgeItem
    };
}
