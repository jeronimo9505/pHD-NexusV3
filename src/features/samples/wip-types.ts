export interface WipObject {
    id: string; order: number; display_order?: number; name: string; class_name: string;
    kind: 'raman' | 'image' | 'auxiliary' | 'supporting' | 'unsupported';
    importable: boolean; shape?: number[]; axis?: { unit: string; start: number; end: number; points: number };
    metadata: Record<string, unknown>; warnings: string[]; suggested_images?: string[];
    history?: { date?: string; text?: string; type?: number }[];
    source_path?: string; source_range?: Record<string, unknown>; references?: Record<string, unknown>;
    field_sources?: Record<string, unknown>; raw_acquisition_parameters?: unknown;
    spatial_geometry?: import('./wip-spatial').WipGeometry;
}
export interface WipInventory {
    session: string; sha256: string; name: string; capabilities?:string[]; source_file_path?:string; size: number; version: number; objects: WipObject[];
}
export interface WipSample {
    id: string; sample_code: string | null; display_id: string; name: string; logbook_id: string | null;
    logbooks: { name: string } | null;
}
export interface WipExtraction {
    record_id: string; h5_relative_path: string | null; archive_relative_path: string;
    attached_images: string[]; provenance: Record<string, any>; shape: number[];
    kind: 'raman' | 'image'; representative: { x: number; y: number }[] | null;
}
