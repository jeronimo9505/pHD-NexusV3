import { useEffect } from 'react';
import { useDriveReportsStore } from '@/stores/useDriveReportsStore';
import { useApp } from '@/context/AppContext';

/**
 * Hook for Drive Reports CRUD operations using Zustand store.
 * NO MORE refreshUserData() callbacks!
 */
export function useDriveReports() {
    const { activeGroupId } = useApp();
    const {
        driveReports,
        loading,
        error,
        fetchDriveReports,
        createDriveReport,
        updateDriveReport,
        deleteDriveReport,
        markAsSeen,
        clearDriveReports,
        subscribeToChanges
    } = useDriveReportsStore();

    // Auto-fetch when group changes
    useEffect(() => {
        if (activeGroupId) {
            fetchDriveReports(activeGroupId);

            // TEMPORARILY DISABLED: Real-time causing infinite loops
            // Will re-enable after seen_by column is added and tested
            /*
            const channel = subscribeToChanges(activeGroupId);
            return () => {
                channel.unsubscribe();
            };
            */
        } else {
            clearDriveReports();
        }
    }, [activeGroupId, fetchDriveReports, clearDriveReports, subscribeToChanges]);

    return {
        driveReports,
        loading,
        error,
        createDriveReport,
        updateDriveReport,
        deleteDriveReport,
        markAsSeen,
        fetchDriveReports: () => fetchDriveReports(activeGroupId), // Manual refresh if needed
    };
}
