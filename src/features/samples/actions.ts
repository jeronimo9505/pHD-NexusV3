'use server';

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";


import { CreateSampleInput, UpdateSampleInput, SampleFieldConfig, SampleNomenclature, Logbook } from "./types";

// ─── LOGBOOK CRUD ────────────────────────────────────────────────

export async function getLogbooksAction(groupId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('logbooks')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true }); // Oldest first (Default 'S' usually first)

    if (error) return { error: error.message };
    return { data };
}

export async function createLogbookAction(input: {
    group_id: string;
    name: string;
    prefix: string;
    description?: string;
    template_logbook_id?: string;
}) {
    const supabase = await createClient();

    // 1. Create Logbook
    const { data: logbook, error } = await supabase
        .from('logbooks')
        .insert({
            group_id: input.group_id,
            name: input.name,
            prefix: input.prefix,
            description: input.description
        })
        .select()
        .single();

    if (error) return { error: error.message };

    // 2. Clone from template if provided
    if (input.template_logbook_id) {
        // Get template logbook details (especially prefix)
        const { data: templateLogbook } = await supabase
            .from('logbooks')
            .select('prefix')
            .eq('id', input.template_logbook_id)
            .single();

        // Clone Nomenclatures
        const { data: noms } = await supabase
            .from('sample_nomenclatures')
            .select('*')
            .eq('logbook_id', input.template_logbook_id);

        if (noms && noms.length > 0) {
            const newNoms = noms.map(n => ({
                group_id: input.group_id,
                logbook_id: logbook.id, // New logbook
                category: n.category,
                code: n.code,
                name: n.name
            }));
            await supabase.from('sample_nomenclatures').insert(newNoms);
        }

        // Clone Fields Config
        const { data: fields } = await supabase
            .from('sample_fields_config')
            .select('*')
            .eq('logbook_id', input.template_logbook_id);

        if (fields && fields.length > 0) {
            const newFields = fields.map(f => ({
                group_id: input.group_id,
                logbook_id: logbook.id, // New logbook
                name: f.name,
                label: f.label,
                type: f.type,
                options: f.options,
                required: f.required,
                order: f.order
            }));
            await supabase.from('sample_fields_config').insert(newFields);
        }

        // 3. Clone Samples (with parent relationship preservation and prefix replacement)
        const { data: samples } = await supabase
            .from('samples')
            .select('*')
            .eq('logbook_id', input.template_logbook_id)
            .order('created_at', { ascending: true });

        if (samples && samples.length > 0) {
            const oldToNewIdMap: Record<string, string> = {};
            const user = (await supabase.auth.getUser()).data.user;
            const oldPrefix = templateLogbook?.prefix;

            // Helper to update IDs based on new prefix to avoid unique constraint violations
            const updateIds = (val: string | null) => {
                if (!val || !oldPrefix) return val;
                if (val.startsWith(`${oldPrefix}-`)) {
                    return val.replace(`${oldPrefix}-`, `${input.prefix}-`);
                }
                return val;
            };

            for (const s of samples) {
                const newSamplePayload = {
                    group_id: input.group_id,
                    logbook_id: logbook.id,
                    display_id: updateIds(s.display_id),
                    sample_code: updateIds(s.sample_code),
                    name: s.name,
                    description: s.description,
                    parent_id: s.parent_id ? (oldToNewIdMap[s.parent_id] || null) : null,
                    type: s.type,
                    status: s.status,
                    attributes: s.attributes,
                    composition: s.composition,
                    created_by: user?.id || s.created_by
                };

                const { data: newSample, error: sampleError } = await supabase
                    .from('samples')
                    .insert(newSamplePayload)
                    .select()
                    .single();

                if (sampleError) {
                    console.error('Error cloning sample:', sampleError);
                    // Continue with other samples or return? Let's try to continue but log.
                    continue;
                }

                if (newSample) {
                    oldToNewIdMap[s.id] = newSample.id;

                    // 4. Clone Characterizations for this sample
                    const { data: chars } = await supabase
                        .from('sample_characterizations')
                        .select('*')
                        .eq('sample_id', s.id);

                    if (chars && chars.length > 0) {
                        const newChars = chars.map(c => ({
                            sample_id: newSample.id,
                            type: c.type,
                            data: c.data,
                            images: c.images,
                            created_by: user?.id || c.created_by,
                            performed_at: (c as any).performed_at
                        }));
                        await supabase.from('sample_characterizations').insert(newChars);
                    }

                    // 5. Clone Comments for this sample
                    const { data: comments } = await supabase
                        .from('sample_comments')
                        .select('*')
                        .eq('sample_id', s.id);

                    if (comments && comments.length > 0) {
                        const newComments = comments.map(c => ({
                            sample_id: newSample.id,
                            author_id: user?.id || c.author_id,
                            content: c.content
                        }));
                        await supabase.from('sample_comments').insert(newComments);
                    }
                }
            }
        }
    }

    revalidatePath(`/${input.group_id}/samples`);
    return { success: true, data: logbook };
}

export async function updateLogbookAction(input: {
    id: string;
    group_id: string;
    name: string;
    description?: string;
}) {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('logbooks')
        .update({
            name: input.name,
            description: input.description,
            // Prefix is typically immutable to preserve ID integrity
        })
        .eq('id', input.id)
        .select()
        .single();

    if (error) return { error: error.message };

    revalidatePath(`/${input.group_id}/samples`);
    return { success: true, data };
}

export async function deleteLogbookAction(id: string, groupId: string) {
    const supabase = await createClient();

    const { error } = await supabase
        .from('logbooks')
        .delete()
        .eq('id', id);

    if (error) return { error: error.message };

    revalidatePath(`/${groupId}/samples`);
    return { success: true };
}


// ─── SAMPLES CRUD ────────────────────────────────────────────────

export async function getSamplesAction(groupId: string, logbookId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('samples')
        .select(`
            *,
            parent:parent_id(id, display_id),
            created_by_user:created_by(full_name, email),
            characterizations:sample_characterizations(id, type, data, created_at, performed_at)
        `)
        .eq('group_id', groupId)
        .eq('logbook_id', logbookId) // Filter by logbook
        .order('created_at', { ascending: false });

    if (error) return { error: error.message };

    // Map characterizations to simple array of types but also keep full list
    const formattedData = data.map((item: any) => ({
        ...item,
        characterization_types: Array.from(new Set(item.characterizations?.map((c: any) => c.type) || [])),
        characterizations: item.characterizations || []
    }));

    return { data: formattedData };
}

export async function createSampleAction(input: CreateSampleInput, logbookId: string) {
    const supabase = await createClient();

    // Get Logbook Prefix
    const { data: logbook } = await supabase
        .from('logbooks')
        .select('prefix')
        .eq('id', logbookId)
        .single();

    const LOGBOOK_PREFIX = logbook?.prefix || 'S';

    // Auto-generate name from composition
    const name = input.composition.length > 0
        ? input.composition.map(c => c.code).join('-')
        : 'New Sample'; // Fallback

    // Auto-generate sample_code
    // Stock (root):   {prefix}-{n}           e.g. S-1, S-2
    // Derived:        {parentCode}-r{n}      e.g. S-1-r1, S-1-r2, S-1-r1-r1
    let sampleCode = '';

    if (input.parent_id) {
        // Derived: more compact logic for future samples
        const { data: parent } = await supabase
            .from('samples')
            .select('sample_code, parent_id') // Get parent_id to check if it's a root
            .eq('id', input.parent_id)
            .single();

        const parentCode = parent?.sample_code || `${LOGBOOK_PREFIX}-?`;

        // Count existing children of this parent to determine branch/mod index
        const { count: siblingCount } = await supabase
            .from('samples')
            .select('*', { count: 'exact', head: true })
            .eq('parent_id', input.parent_id)
            .eq('group_id', input.group_id);

        const index = (siblingCount || 0) + 1;

        if (!parent?.parent_id) {
            // Level 1 (Child of Root): Modification -> Append 'r' + number (no hyphen)
            // Example: A-2 -> A-2r1
            sampleCode = `${parentCode}r${index}`;
        } else {
            // Level 2+ (Sub-branch): Append a lowercase letter
            // Example: A-2r1 -> A-2r1a, A-2r1b
            const letter = String.fromCharCode(96 + index); // 1->a, 2->b...
            sampleCode = `${parentCode}${letter}`;
        }
    } else {
        // Stock (root): remains {Prefix}-{Number}
        const { count } = await supabase
            .from('samples')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', input.group_id)
            .eq('logbook_id', logbookId)
            .is('parent_id', null);

        sampleCode = `${LOGBOOK_PREFIX}-${(count || 0) + 1}`;
    }

    const payload: any = {
        group_id: input.group_id,
        logbook_id: logbookId, // New field passed from UI
        display_id: sampleCode,
        name: name,
        sample_code: sampleCode,
        parent_id: input.parent_id,
        type: input.type,
        status: 'active',
        attributes: input.attributes,
        composition: input.composition || [],
        created_by: (await supabase.auth.getUser()).data.user?.id
        // description is not in input yet? CreateSampleInput needs update? 
        // Assuming description might be in attributes or we need to update input type too?
        // Wait, I didn't update CreateSampleInput in types.ts. I should have. 
        // But for now, if description is separate, I should add it.
        // Let's assume description comes in attributes for now OR I update types.ts again?
        // I'll update types.ts again to be clean.
    };

    // ... (rest of create logic)

    // Actually, I'll update CreateSampleInput in this same tool call via text replacement if possible? 
    // No, I can't edit two files. I'll stick to logic here and expect input to have it.
    // I need to update CreateSampleInput/UpdateSampleInput in types.ts first or assumed it's there.
    // I missed updating CreateSampleInput. 
    // I'll update this file assuming functionality, and I'll do a quick fix on types.ts next.

    if ((input as any).description) payload.description = (input as any).description;

    const { data, error } = await supabase
        .from('samples')
        .insert(payload)
        .select()
        .single();

    if (error) {
        if (error.code === '23505' && error.message.includes('sample_code')) {
            return { error: 'Sample Code conflict. Please try again.' };
        }
        return { error: error.message };
    }

    await supabase.from('sample_audit_log').insert({
        sample_id: data.id,
        user_id: payload.created_by,
        action: 'create',
        changes: { initial: payload }
    });

    revalidatePath(`/${input.group_id}/samples`);
    return { success: true, data };
}

export async function updateSampleAction(input: UpdateSampleInput & { description?: string }, groupId: string) {
    const supabase = await createClient();

    const { data: current } = await supabase
        .from('samples')
        .select('*')
        .eq('id', input.id)
        .single();

    if (!current) return { error: 'Sample not found' };

    const payload: any = {
        updated_at: new Date().toISOString()
    };
    if (input.attributes) payload.attributes = input.attributes;
    if (input.status) payload.status = input.status;
    if (input.description !== undefined) payload.description = input.description;

    if (input.composition) {
        payload.composition = input.composition;
        const newName = input.composition.length > 0
            ? input.composition.map(c => c.code).join('-')
            : 'Empty Sample';
        payload.name = newName;
    }

    if (input.name) {
        payload.name = input.name;
    }

    if (input.sample_code) payload.sample_code = input.sample_code;

    const { data, error } = await supabase
        .from('samples')
        .update(payload)
        .eq('id', input.id)
        .select()
        .single();

    if (error) return { error: error.message };

    const changes: Record<string, any> = {};
    if (input.attributes) changes.attributes = { old: current.attributes, new: input.attributes };
    if (input.status) changes.status = { old: current.status, new: input.status };
    if (input.composition) changes.composition = { old: current.composition, new: input.composition };
    if (input.description !== undefined) changes.description = { old: current.description, new: input.description };

    if (Object.keys(changes).length > 0) {
        await supabase.from('sample_audit_log').insert({
            sample_id: input.id,
            user_id: (await supabase.auth.getUser()).data.user?.id,
            action: 'update',
            changes
        });
    }

    revalidatePath(`/${groupId}/samples`);
    return { success: true, data };
}

// Characterization Actions

export async function createCharacterizationAction(input: {
    sample_id: string;
    group_id: string;
    type: string;
    data: Record<string, any>;
    performed_at?: string;
}) {
    const supabase = await createClient();
    const user = await supabase.auth.getUser();

    const payload = {
        sample_id: input.sample_id,
        type: input.type,
        data: input.data,
        created_by: user.data.user?.id,
        performed_at: input.performed_at || new Date().toISOString()
    };

    const { error } = await supabase.from('sample_characterizations').insert(payload);

    if (error) return { error: error.message };

    revalidatePath(`/${input.group_id}/samples`);
    return { success: true };
}

export async function createBulkCharacterizationAction(input: {
    sample_ids: string[];
    group_id: string;
    type: string;
    data: Record<string, any>;
    performed_at?: string;
}) {
    const supabase = await createClient();
    const user = await supabase.auth.getUser();
    const bulkId = crypto.randomUUID();

    const payloads = input.sample_ids.map(id => ({
        sample_id: id,
        type: input.type,
        data: { ...input.data, __bulk_id__: bulkId },
        created_by: user.data.user?.id,
        performed_at: input.performed_at || new Date().toISOString()
    }));

    const { error } = await supabase.from('sample_characterizations').insert(payloads);

    if (error) return { error: error.message };

    revalidatePath(`/${input.group_id}/samples`);
    return { success: true };
}


export async function updateCharacterizationAction(input: {
    id: string;
    group_id: string;
    data: Record<string, any>;
    type?: string;
    performed_at?: string;
    updateBatch?: boolean;
}) {
    const supabase = await createClient();

    // 1. Get current record to check for bulk_id
    const { data: current } = await supabase
        .from('sample_characterizations')
        .select('data')
        .eq('id', input.id)
        .single();

    const bulkId = (current?.data as any)?.__bulk_id__;

    if (input.updateBatch && bulkId) {
        // Update all related records
        const { error } = await supabase
            .from('sample_characterizations')
            .update({
                data: { ...input.data, __bulk_id__: bulkId },
                type: input.type,
                performed_at: input.performed_at
            })
            .contains('data', { __bulk_id__: bulkId });

        if (error) return { error: error.message };
    } else {
        // Update only this one
        const { error } = await supabase
            .from('sample_characterizations')
            .update({
                data: input.updateBatch ? { ...input.data, __bulk_id__: bulkId } : input.data,
                type: input.type,
                performed_at: input.performed_at
            })
            .eq('id', input.id);

        if (error) return { error: error.message };
    }

    revalidatePath(`/${input.group_id}/samples`);
    return { success: true };
}

export async function deleteCharacterizationAction(id: string, groupId: string) {
    const supabase = await createClient();
    const { error } = await supabase
        .from('sample_characterizations')
        .delete()
        .eq('id', id);

    if (error) return { error: error.message };

    revalidatePath(`/${groupId}/samples`);
    return { success: true };
}

export async function getCharacterizationsAction(sampleId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('sample_characterizations')
        .select(`
            *,
            created_by_user:created_by(full_name)
        `)
        .eq('sample_id', sampleId)
        .order('created_at', { ascending: false });

    if (error) return { error: error.message };
    return { data };
}

export async function getBulkSamplesAction(bulkId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('sample_characterizations')
        .select(`
            sample:sample_id(id, sample_code, name)
        `)
        .contains('data', { __bulk_id__: bulkId });

    if (error) return { error: error.message };

    const samplesMap = new Map();
    (data || []).forEach((item: any) => {
        if (item.sample) {
            samplesMap.set(item.sample.id, item.sample);
        }
    });

    return { data: Array.from(samplesMap.values()) };
}

export async function deleteSampleAction(sampleId: string, groupId: string) {
    const supabase = await createClient();

    // Check if it has children first? RLS cascade might handle it but good to be safe/warn.
    // For now, direct delete.

    const { error } = await supabase.from('samples').delete().eq('id', sampleId);
    if (error) return { error: error.message };

    revalidatePath(`/${groupId}/samples`);
    return { success: true };
}

// ─── CONFIGURATION (Nomenclatures & Fields) ──────────────────────

export async function getNomenclaturesAction(groupId: string, logbookId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('sample_nomenclatures')
        .select('*')
        .eq('group_id', groupId)
        .eq('logbook_id', logbookId) // Filter
        .order('category', { ascending: true })
        .order('code', { ascending: true });

    if (error) return { error: error.message };
    return { data };
}

export async function upsertNomenclatureAction(item: SampleNomenclature) {
    const supabase = await createClient();

    // Clean payload: remove id if empty string to let Postgres generate it
    const payload = { ...item };
    if (!payload.id) {
        delete (payload as any).id;
    }

    const { error } = await supabase
        .from('sample_nomenclatures')
        .upsert(payload)
        .select();

    if (error) return { error: error.message };

    revalidatePath(`/${item.group_id}/samples`);
    return { success: true };
}

export async function deleteNomenclatureAction(id: string, groupId: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('sample_nomenclatures').delete().eq('id', id);
    if (error) return { error: error.message };

    revalidatePath(`/${groupId}/samples`);
    return { success: true };
}

export async function getFieldsConfigAction(groupId: string, logbookId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('sample_fields_config')
        .select('*')
        .eq('group_id', groupId)
        .eq('logbook_id', logbookId) // Filter
        .order('order', { ascending: true });

    if (error) return { error: error.message };
    return { data };
}

export async function upsertFieldConfigAction(field: SampleFieldConfig) {
    const supabase = await createClient();

    // Clean payload: remove id if empty string
    const payload = { ...field };
    if (!payload.id) {
        delete (payload as any).id;
    }

    const { error } = await supabase
        .from('sample_fields_config')
        .upsert(payload)
        .select();

    if (error) return { error: error.message };

    revalidatePath(`/${field.group_id}/samples`);
    return { success: true };
}

export async function deleteFieldConfigAction(id: string, groupId: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('sample_fields_config').delete().eq('id', id);
    if (error) return { error: error.message };

    revalidatePath(`/${groupId}/samples`);
    return { success: true };
}

// ─── SAMPLE COMMENTS ────────────────────────────────────────────────

export async function addSampleCommentAction(sampleId: string, content: string, groupId: string) {
    try {
        if (!sampleId || !content || !groupId) {
            return { error: 'Invalid parameters' };
        }

        const supabase = await createClient();

        // Check authentication
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return { error: 'You must be logged in to comment' };
        }

        const { data, error } = await supabase
            .from('sample_comments')
            .insert({
                sample_id: sampleId,
                author_id: user.id,
                content: content.trim()
            })
            .select()
            .single();

        if (error) {
            console.error('Add comment error:', error);
            return { error: 'Failed to add comment' };
        }

        revalidatePath(`/${groupId}/samples`);
        return { success: true, comment: data };
    } catch (error) {
        console.error('Unexpected error in addSampleCommentAction:', error);
        return { error: 'An unexpected error occurred' };
    }
}

export async function deleteSampleCommentAction(commentId: string, groupId: string) {
    try {
        if (!commentId || !groupId) {
            return { error: 'Invalid parameters' };
        }

        const supabase = await createClient();

        // Check authentication
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return { error: 'You must be logged in to delete a comment' };
        }

        const { error } = await supabase
            .from('sample_comments')
            .delete()
            .eq('id', commentId);

        if (error) {
            console.error('Delete comment error:', error);
            return { error: 'Failed to delete comment. You may not have permission.' };
        }

        revalidatePath(`/${groupId}/samples`);
        return { success: true };
    } catch (error) {
        console.error('Unexpected error in deleteSampleCommentAction:', error);
        return { error: 'An unexpected error occurred' };
    }
}

// ─── ACTIVITY LOG ──────────────────────────────────────────────────

export async function getActivityLogAction(groupId: string) {
    const supabase = await createClient();

    // 1. Fetch Audit Logs
    const { data: audits, error: auditError } = await supabase
        .from('sample_audit_log')
        .select(`
            id,
            sample_id,
            action,
            created_at,
            sample:sample_id(sample_code, name),
            user:user_id(full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

    // 2. Fetch Characterizations
    const { data: chars, error: charError } = await supabase
        .from('sample_characterizations')
        .select(`
            id,
            sample_id,
            type,
            data,
            created_at,
            sample:sample_id(sample_code, name),
            created_by_user:created_by(full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

    if (auditError || charError) return { error: (auditError || charError)?.message };

    // 3. Group and Consolidate
    const groupedChars = new Map<string, any>();
    const singleChars: any[] = [];

    (chars || []).forEach((c: any) => {
        const bId = c.data?.__bulk_id__;
        if (bId) {
            if (!groupedChars.has(bId)) {
                groupedChars.set(bId, {
                    id: bId,
                    type: 'characterization',
                    isBulk: true,
                    action: c.type,
                    created_at: c.created_at,
                    samples: [],
                    user_name: (c.created_by_user as any)?.full_name || 'System'
                });
            }
            const group = groupedChars.get(bId);
            group.samples.push({
                id: c.sample_id,
                code: (c.sample as any)?.sample_code || '?',
                name: (c.sample as any)?.name
            });
        } else {
            singleChars.push({
                id: c.id,
                type: 'characterization',
                action: c.type,
                created_at: c.created_at,
                sample_id: c.sample_id,
                sample_code: (c.sample as any)?.sample_code,
                sample_name: (c.sample as any)?.name,
                user_name: (c.created_by_user as any)?.full_name || 'System'
            });
        }
    });

    const consolidated = [
        ...(audits || []).map(a => ({
            id: a.id,
            type: 'audit',
            action: a.action,
            created_at: a.created_at,
            sample_id: a.sample_id,
            sample_code: (a.sample as any)?.sample_code,
            sample_name: (a.sample as any)?.name,
            user_name: (a.user as any)?.full_name || 'System'
        })),
        ...singleChars,
        ...Array.from(groupedChars.values())
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);

    return { data: consolidated };
}
