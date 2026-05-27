import { Database } from "@/types/supabase";
import { FileText, Calendar, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

type DriveReport = Database['public']['Tables']['drive_reports']['Row'];

interface ActivityFeedProps {
    reports: DriveReport[];
    groupId: string;
}

export function ActivityFeed({ reports, groupId }: ActivityFeedProps) {
    if (!reports?.length) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 text-center">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
                    <Clock size={24} />
                </div>
                <h3 className="text-slate-900 font-medium mb-1">No recent activity</h3>
                <p className="text-slate-500 text-sm">Create a report or document to get started.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h2 className="font-semibold text-slate-900">Recent Reports</h2>
                <Link
                    href={`/${groupId}/drive-reports`}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                    View All
                </Link>
            </div>
            <div className="divide-y divide-slate-100">
                {reports.map((report) => (
                    <div key={report.id} className="p-4 hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 transition-colors">
                                <FileText size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <Link href={`/${groupId}/drive-reports/${report.id}`} className="block">
                                    <h4 className="font-medium text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                                        {report.title}
                                    </h4>
                                </Link>
                                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                    <span className="flex items-center gap-1">
                                        <Calendar size={12} />
                                        {formatDate(report.created_at)}
                                    </span>
                                    <span className={`flex items-center gap-1 capitalize px-1.5 py-0.5 rounded-full ${report.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                        <CheckCircle2 size={10} />
                                        {report.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
