import { SCIENCE_ENGINE_URL } from '@/lib/desktop';
import { collectAssetPaths, normalizeCharacterizationData, replaceAssetPaths } from './characterization-data';
import { getVaultReferencesAction, markCharacterizationRecoveryAction, confirmCharacterizationAssetOperationAction } from './asset-actions';
import { deleteCharacterizationAction } from './actions';
export async function assetRequest<T>(action: string, body: unknown): Promise<T> {
    const response = await fetch(`${SCIENCE_ENGINE_URL}/api/vault-assets/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => null);
    if (!response.ok)
        throw new Error(result?.detail || 'Restart the Python engine to load the unified Data Vault service.');
    return result;
}
export async function prepareCharacterizationData(groupId: string, type: string, data: Record<string, any>) {
    let normalized = normalizeCharacterizationData(data, type);
    data = { ...data, asset_manifest: normalized.asset_manifest };
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window))
        return normalized;
    const root = localStorage.getItem('phdnexus_vault_root'), paths = collectAssetPaths(data);
    if (root && paths.length) {
        const resolved = await assetRequest<any>('resolve', { vault_root: root, group_id: groupId, paths });
        data = replaceAssetPaths(data, resolved.mapping);
        const manifest = await assetRequest<any>('describe', { vault_root: root, group_id: groupId, paths: collectAssetPaths(data) });
        const fileMetadata = { ...data.file_metadata };
        for (const asset of manifest.assets || [])
            if (asset.spectrum)
                fileMetadata[asset.locator.relative_path] = asset.spectrum;
        data = { ...data, file_metadata: fileMetadata };
        normalized = normalizeCharacterizationData({ ...data, asset_manifest: { ...manifest, source: data.asset_manifest?.source, original_locations: data.asset_manifest?.original_locations || paths.filter(path => /^(?:[a-z]:|\/)/i.test(path)), operation: data.asset_manifest?.operation } }, type);
    }
    return normalized;
}
export async function prepareCharacterizationSave(groupId: string, type: string, data: Record<string, any>, sample: Record<string, any>, recordId?: string) {
    let context: {
        root?: string;
        operation_id?: string;
        data: Record<string, any>;
    } = { data };
    const native = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    const root = native ? localStorage.getItem('phdnexus_vault_root') : null;
    if (root && (data.local_h5_paths?.length || data.local_h5_path)) {
        const references = await getVaultReferencesAction(groupId, recordId);
        if (references.error)
            throw new Error(references.error);
        const paths = data.local_h5_paths || [data.local_h5_path];
        const resolved = await assetRequest<any>('resolve', { vault_root: root, group_id: groupId, paths });
        data = replaceAssetPaths(data, resolved.mapping);
        const staged = await assetRequest<any>('rename-prepare', { vault_root: root, group_id: groupId, paths: data.local_h5_paths || [data.local_h5_path],
            metadata: { ...data, ...sample, group_id: groupId, technique: type, parameters: normalizeCharacterizationData(data, type).asset_manifest.reviewed_parameters }, protected_paths: references.paths || [] });
        data = replaceAssetPaths(data, staged.renamed_paths);
        if (staged.operation_id)
            data = { ...data, asset_manifest: { ...data.asset_manifest, operation: { id: staged.operation_id, receipt: staged.receipt } } };
        context = { root, operation_id: staged.operation_id, data };
    }
    context.data = await prepareCharacterizationData(groupId, type, data);
    return context;
}
export async function finishCharacterizationSave(groupId: string, context: {
    root?: string;
    operation_id?: string;
}, commit: boolean, recordId?: string) {
    if (!context.root || !context.operation_id)
        return;
    const references = await getVaultReferencesAction(groupId);
    if (references.error)
        throw new Error(references.error);
    const result = await assetRequest<any>('rename-finish', { vault_root: context.root, operation_id: context.operation_id, commit, protected_paths: references.paths || [] });
    if (commit && recordId) {
        const confirmed = await confirmCharacterizationAssetOperationAction(groupId, recordId, context.operation_id, result);
        if (confirmed.error)
            throw new Error(confirmed.error);
    }
    if (result.cleanup?.errors?.length)
        throw new Error('Some previous file versions remain active. Review them in Vault files.');
    return result;
}
export async function cleanupDeletedCharacterization(groupId: string, event: any) {
    const root = localStorage.getItem('phdnexus_vault_root');
    if (!root)
        throw new Error('Select your Data Vault root to complete file cleanup.');
    const references = await getVaultReferencesAction(groupId);
    if (references.error)
        throw new Error(references.error);
    const receipt = await assetRequest<any>('quarantine', { vault_root: root, operation_id: event.id, group_id: groupId, paths: collectAssetPaths(event.record_snapshot.data), protected_paths: references.paths || [] });
    const marked = await markCharacterizationRecoveryAction(groupId, event.id, receipt.errors?.length ? 'pending' : receipt.files?.length ? 'quarantined' : 'retained', receipt);
    if (marked.error)
        throw new Error(marked.error);
    return receipt;
}
export async function deleteCharacterizationWithAssets(id: string, groupId: string) {
    let result;
    try {
        result = await deleteCharacterizationAction(id, groupId);
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : 'The record could not be deleted. Please retry.' };
    }
    if (result.error)
        return result;
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        try {
            await cleanupDeletedCharacterization(groupId, result.recovery);
        }
        catch (error) {
            return { ...result, warning: `Record deleted. File cleanup is pending in Vault files: ${error instanceof Error ? error.message : String(error)}` };
        }
    }
    return result;
}
