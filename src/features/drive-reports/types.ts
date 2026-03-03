import { Database } from "@/types/supabase";

export type DriveReport = Database['public']['Tables']['drive_reports']['Row'] & {
    author_profile?: {
        full_name: string;
        avatar_url?: string;
    };
    seen_count?: number;
    comment_count?: number;
    task_count?: number;
    linked_tasks?: { task: Database['public']['Tables']['tasks']['Row'] }[];
};

export type ReportType = 'report' | 'ppt' | 'meeting_note';
export type ReportStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type CreateDriveReportInput = {
    title: string;
    group_id: string;
    type?: ReportType;
    status?: ReportStatus;
    start_date?: string;
    end_date?: string;
    is_important?: boolean;
};

export type DriveReportComment = {
    id: string;
    report_id: string;
    author_id: string;
    content: string;
    created_at: string;
    updated_at: string;
    author?: {
        full_name: string;
        avatar_url?: string;
    };
};

