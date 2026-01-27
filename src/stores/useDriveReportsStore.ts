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
    markAsSeen: (id: string, userId: string) => Promise<{ error: any }>;
    clearDriveReports: () => void;
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

            // DIAGNOSTIC START
            try {
                const { data: { user } } = await supabase.auth.getUser();
                const { data: record } = await supabase.from('drive_reports').select('author_id, title').eq('id', id).single();

                console.log("🛑 DELETION DIAGNOSTIC: 🛑");
                console.log("   - Report ID:", id);
                console.log("   - Report Title:", record?.title);
                console.log("   - Report Author ID:", record?.author_id);
                console.log("   - Current User ID :", user?.id);

                if (record?.author_id && user?.id && record.author_id !== user.id) {
                    console.error("❌ MISMATCH DETECTED: You are trying to delete a report you don't own.");
                    console.error("   Policy 'auth.uid() = author_id' will BLOCK this.");
                } else if (!record) {
                    console.error("❌ RECORD NOT FOUND: The ID doesn't exist in DB (already deleted?)");
                } else {
                    console.log("✅ IDS MATCH: You own this report. RLS *should* allow delete.");
                }
            } catch (e) {
                console.error("Diagnostic failed", e);
            }
            // DIAGNOSTIC END

            set((state) => {
                state.driveReports = state.driveReports.filter(r => r.id !== id);
            });

            try {
                const { error, count } = await supabase
                    .from('drive_reports')
                    .delete({ count: 'exact' }) // Request count
                    .eq('id', id);

                if (error) throw error;

                // If count is 0, it silently failed (RLS blocked it or not found)
                if (count === 0) {
                    console.error("❌ SUPABASE DELETED 0 ROWS. RLS Policy likely blocked it.");
                    alert("No se pudo eliminar: No tienes permisos o el reporte no existe.");
                    // Rollback manually since no error thrown
                    set({ driveReports: previousReports });
                    return { error: "Deletion blocked by RLS" };
                }

                console.log('✅ Drive report deleted successfully');
                return { error: undefined };
            } catch (err: any) {
                console.error('❌ Error deleting drive report:', err);

                // Rollback
                set({ driveReports: previousReports });
                return { error: err.message };
            }
        },

        markAsSeen: async (id: string, userId: string) => {
            const previousReports = get().driveReports;

            // Optimistic update
            set((state) => {
                const report = state.driveReports.find(r => r.id === id);
                if (report) {
                    if (!report.seen_by) report.seen_by = [];
                    if (!report.seen_by.includes(userId)) {
                        report.seen_by.push(userId);
                    }
                }
            });

            try {
                // Get current seen_by array
                const { data: current } = await supabase
                    .from('drive_reports')
                    .select('seen_by')
                    .eq('id', id)
                    .single();

                const seenBy = current?.seen_by || [];
                if (!seenBy.includes(userId)) {
                    seenBy.push(userId);
                }

                const { error } = await supabase
                    .from('drive_reports')
                    .update({ seen_by: seenBy })
                    .eq('id', id);

                if (error) throw error;

                console.log('✅ Drive report marked as seen');
                return { error: undefined };
            } catch (err: any) {
                console.error('❌ Error marking drive report as seen:', err);

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
