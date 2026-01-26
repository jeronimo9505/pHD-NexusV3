import { useEffect } from 'react';
import { useKnowledgeStore } from '@/stores/useKnowledgeStore';
import { useApp } from '@/context/AppContext';

/**
 * Hook for Knowledge CRUD operations using Zustand store.
 * NO MORE refreshUserData() callbacks!
 */
export function useKnowledge() {
    const { activeGroupId } = useApp();
    const {
        knowledge,
        loading,
        error,
        fetchKnowledge,
        createKnowledgeItem,
        updateKnowledgeItem,
        deleteKnowledgeItem,
        addComment,
        clearKnowledge
    } = useKnowledgeStore();

    // Auto-fetch when group changes
    useEffect(() => {
        if (activeGroupId) {
            fetchKnowledge(activeGroupId);
        } else {
            clearKnowledge();
        }
    }, [activeGroupId, fetchKnowledge, clearKnowledge]);

    return {
        knowledge,
        loading,
        error,
        createKnowledgeItem,
        updateKnowledgeItem,
        deleteKnowledgeItem,
        addComment,
        fetchKnowledge: () => fetchKnowledge(activeGroupId), // Manual refresh if needed
    };
}
