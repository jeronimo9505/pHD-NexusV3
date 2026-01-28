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

    // Actions
    fetchDriveReports: (groupId: string) => Promise<void>;
    createDriveReport: (data: Partial<DriveReport>) => Promise<{ data: DriveReport | null; error: any }>;
    updateDriveReport: (id: string, data: Partial<DriveReport>) => Promise<{ error: any }>;
    deleteDriveReport: (id: string) => Promise<{ error: any }>;
    markAsSeen: (id: string) => Promise<{ error: any }>;
    clearDriveReports: () => void;
    subscribeToChanges: (groupId: string) => any;
}

export const useDriveReportsStore = create<DriveReportsState>()(
    immer((set, get) => ({
        driveReports: [],
        loading: false,
        error: null,

        fetchDriveReports: async (groupId: string) => {
            set({ loading: true, error: null });

            try {
                const { data, error } = await supabase
                    .from('drive_reports')
                    .select('*')
                    .eq('group_id', groupId)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                console.log('📊 Fetched drive reports:', data?.length || 0);
                set({ driveReports: data || [], loading: false });
            } catch (err: any) {
                console.error('❌ Error fetching drive reports:', err);
                set({ error: err.message, loading: false });
            }
        },

        createDriveReport: async (data: Partial<DriveReport>) => {
            const tempId = `temp-${Date.now()}`;
            const newReport: DriveReport = {
                id: tempId,
                group_id: data.group_id!,
                author_id: data.author_id!,
                title: data.title || 'Nuevo Reporte',
                status: data.status || 'draft',
                type: data.type || 'report',
                is_important: data.is_important || false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...data,
            } as DriveReport;

            // Optimistic update
            set((state) => {
                state.driveReports.unshift(newReport);
            });

            try {
                const { data: created, error } = await supabase
                    .from('drive_reports')
                    .insert([data])
                    .select()
                    .single();

                if (error) throw error;

                // Replace temp with real
                set((state) => {
                    const index = state.driveReports.findIndex(r => r.id === tempId);
                    if (index !== -1 && created) {
                        state.driveReports[index] = created;
                    }
                });

                console.log('✅ Drive report created successfully');
                return { data: created, error: undefined };
            } catch (err: any) {
                console.error('❌ Error creating drive report:', err);

                // Rollback
                set((state) => {
                    state.driveReports = state.driveReports.filter(r => r.id !== tempId);
                });

                return { data: null, error: err.message };
            }
        },

        updateDriveReport: async (id: string, data: Partial<DriveReport>) => {
            const previousReports = get().driveReports;

            // Optimistic update
            set((state) => {
                const report = state.driveReports.find(r => r.id === id);
                if (report) {
                    Object.assign(report, data, { updated_at: new Date().toISOString() });
                }
            });

            try {
                const { error } = await supabase
                    .from('drive_reports')
                    .update(data)
                    .eq('id', id);

                if (error) throw error;

                console.log('✅ Drive report updated successfully');
                return { error: undefined };
            } catch (err: any) {
                console.error('❌ Error updating drive report:', err);

                // Rollback
                set({ driveReports: previousReports });
                return { error: err.message };
            }
        },

        deleteDriveReport: async (id: string) => {
            const previousReports = get().driveReports;

            // Optimistic update - remove immediately
            set((state) => {
                state.driveReports = state.driveReports.filter(r => r.id !== id);
            });

            try {
                const { error } = await supabase
                    .from('drive_reports')
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                console.log('✅ Drive report deleted successfully');
                return { error: undefined };
            } catch (err: any) {
                console.error('❌ Error deleting drive report:', err);

                // Rollback
                set({ driveReports: previousReports });
                return { error: err.message };
            }
        },

        markAsSeen: async (id: string) => {
            try {
                // Get current user automatically
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    console.warn('Cannot mark as seen: No authenticated user');
                    return { error: 'Not authenticated' };
                }

                const userId = user.id;
                const previousReports = get().driveReports;

                // Get current seen_by array first to determine if we're adding or removing
                const { data: current } = await supabase
                    .from('drive_reports')
                    .select('seen_by')
                    .eq('id', id)
                    .single();

                const currentSeenBy = current?.seen_by || [];
                const isCurrentlySeen = currentSeenBy.includes(userId);

                // Toggle: if seen, remove; if not seen, add
                let newSeenBy;
                if (isCurrentlySeen) {
                    newSeenBy = currentSeenBy.filter((uid: string) => uid !== userId);
                } else {
                    newSeenBy = [...currentSeenBy, userId];
                }

                // Optimistic update
                set((state) => {
                    const report = state.driveReports.find(r => r.id === id);
                    if (report) {
                        report.seen_by = newSeenBy;
                    }
                });

                const { error } = await supabase
                    .from('drive_reports')
                    .update({ seen_by: newSeenBy })
                    .eq('id', id);

                if (error) throw error;

                console.log(isCurrentlySeen ? '✅ Drive report unmarked as seen' : '✅ Drive report marked as seen');
                return { error: undefined };
            } catch (err: any) {
                console.error('❌ Error toggling drive report seen status:', err);

                // Rollback
                const previousReports = get().driveReports;
                set({ driveReports: previousReports });
                return { error: err.message };
            }
        },

        clearDriveReports: () => {
            set({ driveReports: [], loading: false, error: null });
        },

        // Real-time subscription handler (to be called externally)
        subscribeToChanges: (groupId: string) => {
            const channel = supabase
                .channel(`drive_reports:${groupId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'drive_reports',
                        filter: `group_id=eq.${groupId}`
                    },
                    (payload) => {
                        console.log('🔄 Drive reports change detected:', payload);

                        if (payload.eventType === 'INSERT') {
                            set((state) => {
                                // Add new report if not exists
                                if (!state.driveReports.find(r => r.id === payload.new.id)) {
                                    state.driveReports.unshift(payload.new as DriveReport);
                                }
                            });
                        } else if (payload.eventType === 'UPDATE') {
                            set((state) => {
                                const index = state.driveReports.findIndex(r => r.id === payload.new.id);
                                if (index !== -1) {
                                    state.driveReports[index] = payload.new as DriveReport;
                                }
                            });
                        } else if (payload.eventType === 'DELETE') {
                            set((state) => {
                                state.driveReports = state.driveReports.filter(r => r.id !== payload.old.id);
                            });
                        }
                    }
                )
                .subscribe();

            return channel;
        },
    }))
);
