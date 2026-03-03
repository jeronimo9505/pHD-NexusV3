export default function GoogleDriveLoading() {
    return (
        <div className="h-full flex flex-col">
            {/* Header skeleton */}
            <div className="px-8 pt-6 pb-4 border-b border-slate-200 bg-white">
                <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-80 bg-slate-100 rounded animate-pulse mt-2" />
            </div>

            {/* Toolbar skeleton */}
            <div className="px-8 py-4 border-b border-slate-100 bg-white flex items-center gap-4">
                <div className="h-10 w-80 bg-slate-100 rounded-lg animate-pulse" />
                <div className="flex-1" />
                <div className="h-10 w-24 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-10 w-32 bg-slate-100 rounded-lg animate-pulse" />
            </div>

            {/* Breadcrumbs skeleton */}
            <div className="px-8 py-3 bg-slate-50/50">
                <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
            </div>

            {/* File list skeleton */}
            <div className="flex-1 px-8 py-2">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 py-3 border-b border-slate-50">
                        <div className="w-8 h-8 bg-slate-100 rounded animate-pulse" />
                        <div className="flex-1">
                            <div className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                        </div>
                        <div className="h-4 w-24 bg-slate-50 rounded animate-pulse" />
                        <div className="h-4 w-20 bg-slate-50 rounded animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}
