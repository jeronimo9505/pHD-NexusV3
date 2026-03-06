export type SampleType = 'stock' | 'derived';
export type SampleStatus = 'active' | 'archived' | 'consumed' | 'in_progress' | 'completed' | 'successful' | 'terminated';

export interface SampleCompositionItem {
    category: string; // e.g. "Substrate"
    value: string; // e.g. "Borofloat"
    code: string; // e.g. "Bt"
    notes?: string; // Optional user notes (e.g. usage conditions)
}

export interface Logbook {
    id: string;
    group_id: string;
    name: string;
    prefix: string;
    description?: string;
    created_at: string;
}

export interface Sample {
    id: string;
    group_id: string;
    logbook_id: string; // New field
    display_id: string;
    sample_code?: string;
    name: string; // Composition-based name
    description?: string;
    parent_id: string | null;
    parent?: { id: string; display_id: string }; // joined
    type: 'stock' | 'derived';
    status: SampleStatus;
    attributes: Record<string, any>;
    composition: SampleCompositionItem[];
    level: number;
    created_by: string;
    created_at: string;
    updated_at: string;
    created_by_user?: { full_name: string; email: string };
    characterizations?: any[];
    characterization_types?: string[];
}

export interface SampleNomenclature {
    id: string;
    group_id: string;
    logbook_id: string; // New field
    category: string;
    code: string;
    name: string;
}

export interface SampleCharacterization {
    id: string;
    sample_id: string;
    type: string;
    data: Record<string, any>;
    images: string[];
    created_by: string;
    created_at: string;
    performed_at: string; // New: Experiment date
}

export type SampleFieldType = 'text' | 'number' | 'select' | 'date' | 'nomenclature' | 'boolean' | 'rich-text';

export interface SampleFieldConfig {
    id: string;
    group_id: string;
    logbook_id: string; // New field
    name: string;
    label: string;
    type: SampleFieldType;
    options: any | null; // JSONB
    required: boolean;
    order: number;
}

export interface CreateSampleInput {
    group_id: string;
    parent_id: string | null;
    type: SampleType;
    attributes: Record<string, any>;
    composition: SampleCompositionItem[];
    description?: string;
    level?: number;
}

export interface UpdateSampleInput {
    id: string;
    attributes?: Record<string, any>;
    status?: SampleStatus;
    composition?: SampleCompositionItem[];
    name?: string; // Optional, usually auto-generated
    sample_code?: string; // Optional, usually auto-generated
    description?: string;
}

export interface SampleComment {
    id: string;
    sample_id: string;
    author_id: string;
    content: string;
    created_at: string;
    updated_at: string;
    author?: {
        full_name: string;
        avatar_url?: string; // Optional if you have avatars
    };
}
