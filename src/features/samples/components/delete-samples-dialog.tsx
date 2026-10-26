'use client';

import { useEffect, useRef } from 'react';
import type { Sample } from '../types';

export function DeleteSamplesDialog({ samples, blockedChildren, saving, error, onCancel, onConfirm, onIncludeChildren }: {
    samples: Sample[]; blockedChildren: number; saving: boolean; error?: string;
    onCancel: () => void; onConfirm: () => void; onIncludeChildren: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const element = dialog.current!;
        element.showModal();
        return () => element.close();
    }, []);
    return <dialog ref={dialog} aria-labelledby="delete-samples-title" aria-describedby="delete-samples-description"
        onCancel={event => { event.preventDefault(); if (!saving) onCancel(); }}
        className="m-auto w-full max-w-lg rounded-xl border border-slate-200 p-6 shadow-xl backdrop:bg-slate-900/40">
        <h2 id="delete-samples-title" className="text-lg font-semibold text-slate-900">Delete {samples.length} sample{samples.length === 1 ? '' : 's'}?</h2>
        <p id="delete-samples-description" className="mt-3 text-sm text-slate-600">
            The selected samples and their measurements will be permanently deleted. Nothing changes until the server confirms the deletion.
        </p>
        <ul className="mt-3 max-h-32 overflow-auto text-sm text-slate-700">
            {samples.map(sample => <li key={sample.id}>{sample.sample_code || sample.display_id} — {sample.name}</li>)}
        </ul>
        {blockedChildren > 0 && <p role="alert" className="mt-4 text-sm text-amber-800">
            {blockedChildren} derived sample{blockedChildren === 1 ? ' is' : 's are'} outside this selection. Select the entire family or archive the parent instead.
        </p>}
        {blockedChildren > 0 && <button type="button" disabled={saving} onClick={onIncludeChildren}
            className="mt-3 rounded-lg border px-3 py-2 text-sm">Include derived samples in selection</button>}
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        {saving && <p role="status" className="mt-4 text-sm text-slate-600">Deleting… Waiting for server confirmation.</p>}
        <div className="mt-6 flex justify-end gap-3">
            <button autoFocus type="button" disabled={saving} onClick={onCancel} className="rounded-lg border px-4 py-2 disabled:opacity-50">Cancel</button>
            <button type="button" disabled={saving || blockedChildren > 0 || samples.length === 0} onClick={onConfirm}
                className="rounded-lg bg-red-700 px-4 py-2 text-white disabled:opacity-50">{saving ? 'Deleting…' : 'Confirm deletion'}</button>
        </div>
    </dialog>;
}
