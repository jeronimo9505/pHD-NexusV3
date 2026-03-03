import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { supabase } from '@/lib/supabase/client';

interface DriveReport {
    id: string;
    group_id: string;
    author_id: string;
    author_name?: string;
    title: string;
    name?: string;
    status: 'draft' | 'pending' | 'submitted' | 'reviewed';
    type: 'report' | 'ppt' | 'meeting_note';
    drive_file_id?: string;
    web_view_link?: string;
    icon_link?: string;
    mime_type?: string;
    sections?: any;
    is_important: boolean;
    start_date?: string;
    end_date?: string;
    submitted_at?: string;
    created_at: string;
    updated_at: string;
    seen_by?: string[];
}

interface DriveReportsState {
    driveReports: DriveReport[];
    loading: boolean;
    error: string | null;

    // Actions - SIMPLE LIKE REPORTS/TASKS
    fetchDriveReports: (groupId: string) => Promise<void>;
    createDriveReport: (data: Partial<DriveReport>) => Promise<{ error?: string; data?: DriveReport }>;
    updateDriveReport: (id: string, data: Partial<DriveReport>) => Promise<{ error?: string }>;
    deleteDriveReport: (id: string) => Promise<{ error?: string }>;
    clearDriveReports: () => void;
}

export const useDriveReportsStore = create<DriveReportsState>()(
    immer((set, get) => ({
        driveReports: [],
        loading: false,
        error: null,

        fetchDriveReports: async (groupId: string) => {
            if (!groupId) {
                set({ driveReports: [], loading: false });
                return;
            }

            set({ loading: true, error: null });

            try {
                const { data, error } = await supabase
                    .from('drive_reports')
                    .select('*')
                    .eq('group_id', groupId)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                set({ driveReports: data || [], loading: false, error: null });
            } catch (err: any) {
                console.error('Error fetching drive reports:', err);
                set({ error: err.message, loading: false });
            }
        },

        createDriveReport: async (reportData: Partial<DriveReport>) => {
            // Optimistic update
            const tempId = `temp-${Date.now()}`;
            const optimisticReport: DriveReport = {
                id: tempId,
                status: 'draft',
                type: 'report',
                is_important: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...reportData,
            } as DriveReport;

            set((state) => {
                state.driveReports.unshift(optimisticReport);
            });

            try {
                const { data, error } = await supabase
                    .from('drive_reports')
                    .insert(reportData)
                    .select()
                    .single();

                if (error) throw error;

                // Replace temp with real
                set((state) => {
                    const index = state.driveReports.findIndex(r => r.id === tempId);
                    if (index !== -1) {
                        state.driveReports[index] = data;
                    }
                });

                return { data };
            } catch (err: any) {
                console.error('Error creating drive report:', err);

                // Rollback
                set((state) => {
                    state.driveReports = state.driveReports.filter(r => r.id !== tempId);
                });

                return { error: err.message };
            }
        },

        updateDriveReport: async (id: string, updates: Partial<DriveReport>) => {
            const previousReports = get().driveReports;

            // Optimistic update
            set((state) => {
                const report = state.driveReports.find(r => r.id === id);
                if (report) {
                    Object.assign(report, updates);
                }
            });

            try {
                const { error } = await supabase
                    .from('drive_reports')
                    .update(updates)
                    .eq('id', id);

                if (error) throw error;

                return { error: undefined };
            } catch (err: any) {
                console.error('Error updating drive report:', err);

                // Rollback
                set({ driveReports: previousReports });
                return { error: err.message };
            }
        },

        deleteDriveReport: async (id: string) => {
            const previousReports = get().driveReports;

            // Optimistic update
            set((state) => {
                state.driveReports = state.driveReports.filter(r => r.id !== id);
            });

            try {
                const { error } = await supabase
                    .from('drive_reports')
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                return { error: undefined };
            } catch (err: any) {
                console.error('Error deleting drive report:', err);

                // Rollback
                set({ driveReports: previousReports });
                return { error: err.message };
            }
        },

        clearDriveReports: () => {
            set({ driveReports: [], loading: false, error: null });
        },
    }))
);
