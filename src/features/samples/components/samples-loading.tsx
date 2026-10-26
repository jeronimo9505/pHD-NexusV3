export function SamplesTableLoading() {
    return (
        <div role="status" aria-label="Loading samples" className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
            <p className="text-sm text-slate-500">Loading selected logbook…</p>
            {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-9 rounded bg-slate-100 motion-safe:animate-pulse" />
            ))}
        </div>
    );
}

export function SamplesLoading() {
    return (
        <div className="h-full flex flex-col p-6 space-y-6">
            <h1 className="text-2xl font-bold text-slate-800">🧪 Sample Logbooks</h1>
            <SamplesTableLoading />
        </div>
    );
}
