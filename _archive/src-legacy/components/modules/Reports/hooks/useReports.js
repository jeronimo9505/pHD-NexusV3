import { useEffect } from 'react';
import { useReportsStore } from '@/stores/useReportsStore';
import { useApp } from '@/context/AppContext';

/**
 * Hook for Reports CRUD operations using Zustand store.
 * NO MORE refreshUserData() callbacks!
 */
export function useReports() {
    const { activeGroupId } = useApp();
    const {
        reports,
        loading,
        error,
        fetchReports,
        createReport,
        updateReport,
        deleteReport,
        clearReports
    } = useReportsStore();

    // Auto-fetch when group changes
    useEffect(() => {
        if (activeGroupId) {
            fetchReports(activeGroupId);
        } else {
            clearReports();
        }
    }, [activeGroupId, fetchReports, clearReports]);

    return {
        reports,
        loading,
        error,
        createReport,
        updateReport,
        deleteReport,
        fetchReports: () => fetchReports(activeGroupId), // Manual refresh if needed
    };
}

/**
 * Hook to get details of a specific report by ID.
 * Uses Zustand store directly.
 */
export function useReportDetails(reportId) {
    const { reports, loading } = useReportsStore();
    const report = reports.find(r => r.id === reportId);

    return {
        report,
        loading,
    };
}
