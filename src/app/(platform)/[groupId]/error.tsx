'use client';

import Link from 'next/link';

export default function ModuleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <div role="alert" className="flex h-full min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
        <h2 className="text-xl font-semibold text-slate-900">We couldn&apos;t load this module</h2>
        <p className="max-w-md text-sm text-slate-500">Check your connection and try again. Your saved work is still available.</p>
        <button type="button" onClick={reset} className="rounded-lg bg-slate-900 px-5 py-2 text-white">Try again</button>
        <Link href="/dashboard" className="text-sm text-indigo-600">Back to your groups</Link>
    </div>;
}
