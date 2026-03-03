import { ReportListSkeleton } from '@/features/drive-reports/components/report-list-skeleton';

export default function DriveReportsLoading() {
    return (
        <div className="h-full flex flex-col">
            {/* Header Skeleton */}
            <div className="px-6 pt-5 pb-4 bg-white border-b border-slate-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="animate-pulse">
                        <div className="h-8 bg-slate-200 rounded w-48 mb-2" />
                        <div className="h-4 bg-slate-200 rounded w-64" />
                    </div>
                    <div className="w-24 h-10 bg-slate-200 rounded-lg animate-pulse" />
                </div>
            </div>

            {/* Filters Skeleton */}
            <div className="px-6 py-4 bg-white border-b border-slate-200">
                <div className="flex flex-col sm:flex-row gap-3 animate-pulse">
                    <div className="flex-1 h-10 bg-slate-200 rounded-lg" />
                    <div className="w-32 h-10 bg-slate-200 rounded-lg" />
                    <div className="w-32 h-10 bg-slate-200 rounded-lg" />
                </div>
            </div>

            {/* Content Skeleton */}
            <div className="flex-1 overflow-y-auto p-6">
                <ReportListSkeleton />
            </div>
        </div>
    );
}
