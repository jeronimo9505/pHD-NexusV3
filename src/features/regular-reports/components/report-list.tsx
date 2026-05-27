import { RegularReport } from '../types';
// Card import removed as it does not exist
import Link from 'next/link';
import { FileText, Calendar } from 'lucide-react';

interface ReportListProps {
    reports: RegularReport[];
    groupId: string;
}

export function ReportList({ reports, groupId }: ReportListProps) {
    if (reports.length === 0) {
        return (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-500">No reports found.</p>
            </div>
        );
    }

    return (
        <div className="grid gap-4">
            {reports.map((report) => (
                <Link
                    key={report.id}
                    href={`/${groupId}/reports/${report.id}`}
                    className="block p-4 bg-white rounded-xl border hover:shadow-md transition-all"
                >
                    <div className="flex justify-between items-start">
                        <div className="flex gap-4">
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                                <FileText size={24} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900">
                                    Weekly Report: {new Date(report.week_start).toLocaleDateString()} - {new Date(report.week_end).toLocaleDateString()}
                                </h3>
                                <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <Calendar size={14} /> Week {getWeekNumber(new Date(report.week_start))}
                                    </span>
                                    <span>•</span>
                                    <span>{report.author?.full_name || 'Unknown Author'}</span>
                                </div>
                            </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-medium capitalize 
                            ${report.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                                report.status === 'reviewed' ? 'bg-emerald-100 text-emerald-700' :
                                    'bg-slate-100 text-slate-700'}`}>
                            {report.status}
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    );
}

function getWeekNumber(d: Date) {
    // ISO week number helper
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}
