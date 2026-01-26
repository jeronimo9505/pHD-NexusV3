import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { supabase } from '@/lib/supabase/client';

interface KnowledgeItem {
    id: string;
    group_id: string;
    created_by: string;
    title: string;
    content?: string;
    url?: string;
    drive_file_id?: string;
    category: 'protocol' | 'reference' | 'note' | 'resource';
    tags?: string[];
    is_pinned?: boolean;
    created_at?: string;
    updated_at?: string;
    comments?: any[];
}

interface KnowledgeState {
    knowledge: KnowledgeItem[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchKnowledge: (groupId: string) => Promise<void>;
    createKnowledgeItem: (data: Partial<KnowledgeItem>) => Promise<{ error?: string; data?: KnowledgeItem }>;
    updateKnowledgeItem: (id: string, data: Partial<KnowledgeItem>) => Promise<{ error?: string }>;
    deleteKnowledgeItem: (id: string) => Promise<{ error?: string }>;
    addComment: (itemId: string, text: string, authorId: string) => Promise<{ error?: string }>;
    clearKnowledge: () => void;
}

export const useKnowledgeStore = create<KnowledgeState>()(
    immer((set, get) => ({
        knowledge: [],
        loading: false,
        error: null,

        fetchKnowledge: async (groupId: string) => {
            if (!groupId) {
                set({ knowledge: [], loading: false });
                return;
            }

            set({ loading: true, error: null });

            try {
                const { data, error } = await supabase
                    .from('knowledge_items')
                    .select(`
            *,
            comments:knowledge_comments(id, text, author_id, created_at, author:profiles(full_name))
          `)
                    .eq('group_id', groupId)
                    .order('is_pinned', { ascending: false })
                    .order('created_at', { ascending: false });

                if (error) throw error;

                set({ knowledge: data || [], loading: false, error: null });
            } catch (err: any) {
                console.error('Error fetching knowledge:', err);
                set({ error: err.message, loading: false });
            }
        },

        createKnowledgeItem: async (itemData: Partial<KnowledgeItem>) => {
            // 1. Optimistic update
            const tempId = `temp-${Date.now()}`;
            const optimisticItem: KnowledgeItem = {
                id: tempId,
                category: 'reference',
                is_pinned: false,
                created_at: new Date().toISOString(),
                ...itemData,
            } as KnowledgeItem;

            set((state) => {
                state.knowledge.unshift(optimisticItem);
            });

            try {
                // 2. Server mutation
                const { data, error } = await supabase
                    .from('knowledge_items')
                    .insert(itemData)
                    .select(`
            *,
            comments:knowledge_comments(id, text, author_id, created_at, author:profiles(full_name))
          `)
                    .single();

                if (error) throw error;

                // 3. Replace temp with real
                set((state) => {
                    const index = state.knowledge.findIndex(k => k.id === tempId);
                    if (index !== -1) {
                        state.knowledge[index] = data;
                    }
                });

                return { data, error: undefined };
            } catch (err: any) {
                console.error('Error creating knowledge item:', err);

                // Rollback
                set((state) => {
                    state.knowledge = state.knowledge.filter(k => k.id !== tempId);
                });

                return { error: err.message };
            }
        },

        updateKnowledgeItem: async (id: string, updates: Partial<KnowledgeItem>) => {
            // 1. Optimistic update
            const previousKnowledge = get().knowledge;

            set((state) => {
                const item = state.knowledge.find(k => k.id === id);
                if (item) {
                    Object.assign(item, updates);
                }
            });

            try {
                // 2. Server mutation
                const { error } = await supabase
                    .from('knowledge_items')
                    .update(updates)
                    .eq('id', id);

                if (error) throw error;

                return { error: undefined };
            } catch (err: any) {
                console.error('Error updating knowledge item:', err);

                // Rollback
                set({ knowledge: previousKnowledge });

                return { error: err.message };
            }
        },

        deleteKnowledgeItem: async (id: string) => {
            // 1. Optimistic update
            const previousKnowledge = get().knowledge;

            set((state) => {
                state.knowledge = state.knowledge.filter(k => k.id !== id);
            });

            try {
                // 2. Server mutation
                const { error } = await supabase
                    .from('knowledge_items')
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                console.log('✅ Knowledge item deleted successfully');
                return { error: undefined };
            } catch (err: any) {
                console.error('❌ Error deleting knowledge item:', err);

                // Rollback
                set({ knowledge: previousKnowledge });

                return { error: err.message };
            }
        },

        addComment: async (itemId: string, text: string, authorId: string) => {
            try {
                const { error } = await supabase
                    .from('knowledge_comments')
                    .insert({ item_id: itemId, text, author_id: authorId });

                if (error) throw error;

                // Refetch item to get updated comments
                const { data } = await supabase
                    .from('knowledge_items')
                    .select(`
            *,
            comments:knowledge_comments(id, text, author_id, created_at, author:profiles(full_name))
          `)
                    .eq('id', itemId)
                    .single();

                if (data) {
                    set((state) => {
                        const index = state.knowledge.findIndex(k => k.id === itemId);
                        if (index !== -1) {
                            state.knowledge[index] = data;
                        }
                    });
                }

                return { error: undefined };
            } catch (err: any) {
                console.error('Error adding comment:', err);
                return { error: err.message };
            }
        },

        clearKnowledge: () => {
            set({ knowledge: [], loading: false, error: null });
        },
    }))
);
