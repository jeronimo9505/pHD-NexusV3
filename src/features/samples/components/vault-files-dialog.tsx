'use client';
import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { assetRequest, prepareCharacterizationSave, finishCharacterizationSave, cleanupDeletedCharacterization, prepareCharacterizationData } from '../characterization-assets';
import { archiveUnlinkedMeasurementAction, markCharacterizationRecoveryAction, getVaultReferencesAction, getCharacterizationRecoveryAction, getCharacterizationRecoveryDetailsAction, restoreCharacterizationRecordAction } from '../asset-actions';
import { createCharacterizationAction } from '../actions';
import { WipSamplePicker } from './wip-sample-picker';
import { getWipSampleCatalogAction } from '../wip-actions';
import type { WipSample } from '../wip-types';
export function VaultFilesDialog({ groupId, onClose }: {
    groupId: string;
    onClose: () => void;
}) {
    const [assets, setAssets] = useState<any[]>([]), [events, setEvents] = useState<any[]>([]), [tab, setTab] = useState('unlinked');
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState<any>(null), [sample, setSample] = useState<WipSample | null>(null);
    const root = typeof window !== 'undefined' ? localStorage.getItem('phdnexus_vault_root') || '' : '';
    const load = useCallback(async () => {
        setBusy(true);
        setError('');
        try {
            const [references, recovery] = await Promise.all([getVaultReferencesAction(groupId), getCharacterizationRecoveryAction(groupId)]);
            if (references.error)
                throw new Error(references.error);
            if (recovery.error)
                throw new Error(recovery.error);
            if (!root)
                throw new Error('Choose your synced Data Vault root in Local Desktop Settings.');
            const result = await assetRequest<any>('audit', { vault_root: root, group_id: groupId, paths: references.paths || [] });
            setAssets(result.assets);
            setEvents(recovery.data || []);
            if (result.errors?.length)
                setError(`${result.errors.length} files could not be inspected. Files from other groups are never modified.`);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy(false);
        }
    }, [groupId, root]);
    useEffect(() => { void load(); }, [load]);
    async function choose(asset: any) { setSelected(asset); setSample(null); if (asset.metadata.sample_id) {
        const result = await getWipSampleCatalogAction(groupId, '', asset.metadata.sample_id);
        setSample(result.data?.[0] || null);
    } }
    async function recover() {
        if (!sample || !selected || busy)
            return;
        setBusy(true);
        setError('');
        try {
            const context = await prepareCharacterizationSave(groupId, selected.metadata.technique || 'Raman', selected.recovery_data, { sample_id: sample.id, sample_code: sample.sample_code || sample.display_id, sample_name: sample.name, logbook_name: sample.logbooks?.name || 'Samples' }, selected.metadata.wip_import_key);
            const result = await createCharacterizationAction({ group_id: groupId, sample_id: sample.id, type: selected.metadata.technique || 'Raman', data: context.data, record_id: selected.metadata.wip_import_key });
            if (result.error) {
                await finishCharacterizationSave(groupId, context, false);
                throw new Error(result.error);
            }
            await finishCharacterizationSave(groupId, context, result.created !== false, result.id);
            toast.success(result.created === false ? 'An existing record already identifies this measurement. Original files were kept.' : 'Record recovered with readable file names and metadata saved in Supabase.');
            setSelected(null);
            await load();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy(false);
        }
    }
    async function quarantineAsset(asset: any) {
        if (!confirm('Move this unlinked measurement and its unshared images to recovery? Nothing is permanently deleted.'))
            return;
        setBusy(true);
        try {
            const references = await getVaultReferencesAction(groupId);
            if (references.error)
                throw new Error(references.error);
            const metadata = await prepareCharacterizationData(groupId, asset.metadata.technique || 'Raman', asset.recovery_data);
            const queued = await archiveUnlinkedMeasurementAction(groupId, asset.metadata.sample_id, asset.metadata.technique || 'Raman', metadata, asset.metadata.wip_import_key);
            if (queued.error)
                throw new Error(queued.error);
            await cleanupDeletedCharacterization(groupId, queued.data);
            await load();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy(false);
        }
    }
    async function restoreEvent(event: any) {
        setBusy(true);
        try {
            const details = await getCharacterizationRecoveryDetailsAction(groupId, event.id);
            if (details.error)
                throw new Error(details.error);
            if (details.data.cleanup_receipt?.files?.length)
                await assetRequest('restore', { vault_root: root, operation_id: event.id, receipt: details.data.cleanup_receipt });
            await markCharacterizationRecoveryAction(groupId, event.id, 'retained', { ...details.data.cleanup_receipt, files_restored: true });
            const prepared = await prepareCharacterizationData(groupId, details.data.record_snapshot.type, details.data.record_snapshot.data);
            const restored = await restoreCharacterizationRecordAction(groupId, event.id, prepared);
            if (restored.error) {
                await load();
                throw new Error(restored.error + ' Files are restored. If the original sample no longer exists, use Unlinked to choose another sample.');
            }
            toast.success('Characterization and available local files restored');
            await load();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy(false);
        }
    }
    async function completeCleanup(event: any) { setBusy(true); try {
        const details = await getCharacterizationRecoveryDetailsAction(groupId, event.id);
        if (details.error)
            throw new Error(details.error);
        await cleanupDeletedCharacterization(groupId, details.data);
        await load();
    }
    catch (err) {
        setError(err instanceof Error ? err.message : String(err));
    }
    finally {
        setBusy(false);
    } }
    return <div className="fixed inset-0 z-[220] bg-slate-950/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Data Vault files"><div className="bg-white rounded-xl p-5 w-full max-w-5xl max-h-[94vh] flex flex-col gap-3">
        <header className="flex justify-between"><div><h2 className="font-bold">Data Vault Files & Recovery</h2><p className="text-xs text-slate-500 break-all">{root}</p></div><button type="button" onClick={onClose} aria-label="Close vault files"><X /></button></header>
        <p className="text-xs text-slate-600">Manual and WITec imports use the same file lifecycle. Paths are relative to your selected root, so the synced structure can be reconnected on another computer. WITec source projects are retained.</p>
        <nav className="flex gap-2 text-sm"><button type="button" className="border rounded p-2" onClick={() => setTab('unlinked')}>Unlinked ({assets.filter(asset => !asset.linked).length})</button><button type="button" className="border rounded p-2" onClick={() => setTab('linked')}>Referenced ({assets.filter(asset => asset.linked).length})</button><button type="button" className="border rounded p-2" onClick={() => setTab('recovery')}>Deleted records ({events.length})</button><button type="button" className="ml-auto border rounded p-2" disabled={busy} onClick={load}>{busy ? 'Working…' : 'Refresh'}</button></nav>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="overflow-auto min-h-0 divide-y">{tab === 'recovery' ? events.map(event => <div key={event.id} className="p-3 text-sm flex gap-3 items-center"><span className="flex-1">{event.record_type} · {new Date(event.deleted_at).toLocaleString('en-GB')}<small className="block text-slate-500">{event.cleanup_state}</small></span>{event.cleanup_state === 'pending' && <button type="button" disabled={busy} className="border rounded p-2" onClick={() => completeCleanup(event)}>Complete file cleanup</button>}<button type="button" disabled={busy} className="border rounded p-2" onClick={() => restoreEvent(event)}>Restore record & files</button></div>) : assets.filter(asset => asset.linked === (tab === 'linked')).map(asset => <div key={asset.locator.relative_path} className="p-3 text-sm"><p className="font-mono break-all">{asset.locator.relative_path}</p><p className="text-xs text-slate-500">{asset.metadata.sample_code} · {asset.spectrum?.spectra} spectra · {(asset.size / 1024 ** 2).toFixed(1)} MB</p>{!asset.linked && <div className="mt-2 flex gap-2"><button type="button" disabled={busy} className="border rounded p-2 text-violet-700" onClick={() => choose(asset)}>Recover & normalize name</button><button type="button" disabled={busy} className="border rounded p-2" onClick={() => quarantineAsset(asset)}>Move to recovery</button></div>}</div>)}</div>
        {selected && <section className="border-t pt-3 space-y-2"><h3 className="text-sm font-semibold">Recover this measurement into a sample</h3><p className="text-xs text-slate-500">Original metadata and images will be retained. The generated name uses the same parameters as a new manual record.</p><WipSamplePicker groupId={groupId} value={sample} onSelect={setSample} disabled={busy} label="Recovery destination sample"/><button type="button" className="bg-violet-600 text-white rounded px-3 py-2 text-sm" disabled={busy || !sample} onClick={recover}>Recover measurement</button><button type="button" className="ml-2 text-sm" onClick={() => setSelected(null)}>Cancel</button></section>}
    </div></div>;
}
