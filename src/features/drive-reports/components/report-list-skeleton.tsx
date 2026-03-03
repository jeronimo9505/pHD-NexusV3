export function ReportCardSkeleton() {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 bg-slate-200 rounded-lg" />
                    <div className="flex-1">
                        <div className="h-5 bg-slate-200 rounded w-3/4 mb-2" />
                        <div className="h-4 bg-slate-200 rounded w-1/2" />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-slate-200 rounded-lg" />
                    <div className="w-8 h-8 bg-slate-200 rounded-lg" />
                </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="flex items-center gap-4">
                    <div className="h-4 bg-slate-200 rounded w-16" />
                    <div className="h-4 bg-slate-200 rounded w-16" />
                    <div className="h-4 bg-slate-200 rounded w-16" />
                </div>
            </div>
        </div>
    );
}

export function ReportListSkeleton() {
    return (
        <div className="space-y-4">
            <ReportCardSkeleton />
            <ReportCardSkeleton />
            <ReportCardSkeleton />
        </div>
    );
}
