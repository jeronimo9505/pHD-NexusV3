export const CHARACTERIZATION_SYSTEM_KEYS = new Set(['equipment', 'notes', '__order__', 'file_origin', 'drive_file_link', 'raman_spectrum_file_id', 'raman_drive_sync', 'wip_import', 'wip_archive_path', 'local_h5_path', 'local_h5_paths', 'original_file', 'original_files', '__bulk_id__', 'file_metadata', 'attached_images', 'attached_image', 'asset_manifest']);
export function collectAssetPaths(data: Record<string, any>): string[] {
    const paths = [...(data.local_h5_paths || []), data.local_h5_path, data.wip_archive_path, ...(data.attached_images || [])];
    for (const image of data.wip_import?.attached_image_metadata || [])
        paths.push(image.path, image.annotated_path);
    for (const asset of data.asset_manifest?.assets || []) {
        if (asset.locator?.root === 'data_vault')
            paths.push(asset.locator.relative_path);
        if (asset.parent_locator?.root === 'data_vault')
            paths.push(asset.parent_locator.relative_path);
    }
    return Array.from(new Set(paths.filter((path): path is string => typeof path === 'string' && path.length > 0 && !path.split(/[\\/]/).includes('..'))));
}
export function collectWorkspacePaths(value: unknown): string[] {
    if (typeof value === 'string')
        return /\.(h5|hdf5|png|jpe?g)$/i.test(value) && !/^(?:[a-z]:|\/)/i.test(value) ? [value] : [];
    if (Array.isArray(value))
        return value.flatMap(collectWorkspacePaths);
    if (value && typeof value === 'object')
        return Object.values(value).flatMap(collectWorkspacePaths);
    return [];
}
export function replaceAssetPaths(value: any, mapping: Record<string, string>): any {
    if (typeof value === 'string')
        return mapping[value] || value;
    if (Array.isArray(value))
        return value.map(item => replaceAssetPaths(item, mapping));
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [mapping[key] || key, replaceAssetPaths(item, mapping)]));
    return value;
}
export function normalizeCharacterizationData(data: Record<string, any>, type: string): Record<string, any> {
    const keys: Array<string> = Array.isArray(data.__order__) ? data.__order__ : Object.keys(data).filter(key => !CHARACTERIZATION_SYSTEM_KEYS.has(key));
    const parameters = Object.fromEntries(keys.filter(key => !CHARACTERIZATION_SYSTEM_KEYS.has(key)).map(key => [key, data[key]]));
    const manifest = data.asset_manifest || { version: 1, assets: collectAssetPaths(data).map(path => ({ kind: /\.h5$/i.test(path) ? 'raman_hdf5' : 'image', locator: { root: 'data_vault', relative_path: /^(?:[a-z]:|\/)/i.test(path) ? null : path }, ...(/^(?:[a-z]:|\/)/i.test(path) ? { original_path: path } : {}) })) };
    return { ...data, asset_manifest: { ...manifest, version: 1, technique: type, reviewed_parameters: parameters,
            source: data.wip_import ? { kind: 'witec_project', sha256: data.wip_import.source_hash, object_id: data.wip_import.object_id,
                locator: { root: 'witec_library', relative_path: data.wip_import.library?.relative_path || null }, original_path: data.wip_import.original_source_file_path || data.wip_import.source_file_path } : manifest.source || { kind: 'manual' } } };
}
