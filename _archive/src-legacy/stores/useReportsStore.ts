import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { supabase } from '@/lib/supabase/client';

interface Report {
    id: string;
    group_id: string;
    author_id: string;
    week_start: string;
    week_end: string;
    status: 'draft' | 'submitted' | 'reviewed';
    sections?: any;
    author?: any;
    views?: any[];
    created_at?: string;
    updated_at?: string;
}

interface ReportsState {
    reports: Report[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchReports: (groupId: string) => Promise<void>;
    createReport: (data: Partial<Report>) => Promise<{ error?: string; data?: Report }>;
    updateReport: (id: string, data: Partial<Report>) => Promise<{ error?: string }>;
    deleteReport: (id: string) => Promise<{ error?: string }>;
    clearReports: () => void;
}

export const useReportsStore = create<ReportsState>()(
    immer((set, get) => ({
        reports: [],
        loading: false,
        error: null,

        fetchReports: async (groupId: string) => {
            if (!groupId) {
                set({ reports: [], loading: false });
                return;
            }

            set({ loading: true, error: null });

            try {
                const { data, error } = await supabase
                    .from('reports')
                    .select(`
            *,
            author:profiles!reports_author_id_fkey(id, full_name, email),
            sections:report_sections(*),
            views:report_views(user_id, seen_at)
          `)
                    .eq('group_id', groupId)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                set({ reports: data || [], loading: false, error: null });
            } catch (err: any) {
                console.error('Error fetching reports:', err);
                set({ error: err.message, loading: false });
            }
        },

        createReport: async (reportData: Partial<Report>) => {
            // 1. Optimistic update
            const tempId = `temp-${Date.now()}`;
            const optimisticReport: Report = {
                id: tempId,
                status: 'draft',
                created_at: new Date().toISOString(),
                ...reportData,
            } as Report;

            set((state) => {
                state.reports.unshift(optimisticReport);
            });

            try {
                // 2. Server mutation
                const { data, error } = await supabase
                    .from('reports')
                    .insert(reportData)
                    .select(`
            *,
            author:profiles!reports_author_id_fkey(id, full_name, email),
            sections:report_sections(*),
            views:report_views(user_id, seen_at)
          `)
                    .single();

                if (error) throw error;

                // 3. Replace temp with real
                set((state) => {
                    const index = state.reports.findIndex(r => r.id === tempId);
                    if (index !== -1) {
                        state.reports[index] = data;
                    }
                });

                return { data, error: undefined };
            } catch (err: any) {
                console.error('Error creating report:', err);

                // Rollback optimistic update
                set((state) => {
                    state.reports = state.reports.filter(r => r.id !== tempId);
                });

                return { error: err.message };
            }
        },

        updateReport: async (id: string, updates: Partial<Report>) => {
            // 1. Optimistic update
            const previousReports = get().reports;

            set((state) => {
                const report = state.reports.find(r => r.id === id);
                if (report) {
                    Object.assign(report, updates);
                }
            });

            try {
                // 2. Server mutation
                const { error } = await supabase
                    .from('reports')
                    .update(updates)
                    .eq('id', id);

                if (error) throw error;

                return { error: undefined };
            } catch (err: any) {
                console.error('Error updating report:', err);

                // Rollback
                set({ reports: previousReports });

                return { error: err.message };
            }
        },

        deleteReport: async (id: string) => {
            // 1. Optimistic update
            const previousReports = get().reports;

            set((state) => {
                state.reports = state.reports.filter(r => r.id !== id);
            });

            try {
                // 2. Server mutation
                const { error } = await supabase
                    .from('reports')
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                console.log('✅ Report deleted successfully');
                return { error: undefined };
            } catch (err: any) {
                console.error('❌ Error deleting report:', err);

                // Rollback
                set({ reports: previousReports });

                return { error: err.message };
            }
        },

        clearReports: () => {
            set({ reports: [], loading: false, error: null });
        },
    }))
);
