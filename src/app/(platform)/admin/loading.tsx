export default function AdminLoading() {
    return <div role="status" aria-label="Loading administration" className="p-8 space-y-5">
        <h1 className="text-2xl font-bold text-slate-800">Administration</h1>
        <p className="text-sm text-slate-500">Loading users and groups…</p>
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 rounded bg-slate-100 motion-safe:animate-pulse" />)}
    </div>;
}
