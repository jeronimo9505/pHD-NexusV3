'use client';
export default function Loading() {
    return (
        <div className="h-full flex items-center justify-center animate-in fade-in duration-300">
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-xs text-slate-400 font-medium tracking-wide">Loading...</span>
            </div>
        </div>
    );
}
