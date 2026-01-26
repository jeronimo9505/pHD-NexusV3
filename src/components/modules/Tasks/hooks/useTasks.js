import { useEffect } from 'react';
import { useTasksStore } from '@/stores/useTasksStore';
import { useApp } from '@/context/AppContext';

/**
 * Hook for Tasks CRUD operations using Zustand store.
 * NO MORE refreshUserData() callbacks!
 */
export function useTasks() {
    const { activeGroupId } = useApp();
    const {
        tasks,
        loading,
        error,
        fetchTasks,
        createTask,
        updateTask,
        deleteTask,
        addComment,
        clearTasks
    } = useTasksStore();

    // Auto-fetch when group changes
    useEffect(() => {
        if (activeGroupId) {
            fetchTasks(activeGroupId);
        } else {
            clearTasks();
        }
    }, [activeGroupId, fetchTasks, clearTasks]);

    return {
        tasks,
        loading,
        error,
        createTask,
        updateTask,
        deleteTask,
        addComment,
        fetchTasks: () => fetchTasks(activeGroupId), // Manual refresh if needed
    };
}
