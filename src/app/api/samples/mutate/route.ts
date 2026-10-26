import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '@/lib/supabase/server';
import { createSampleRecord, deleteSampleRecords } from '@/features/samples/server/mutations';

const scope = { groupId: z.string().uuid(), logbookId: z.string().uuid() };
const createSchema = z.object({ ...scope, requestId: z.string().uuid(),
    input: z.object({ parent_id: z.string().uuid().nullable(), type: z.enum(['stock', 'derived']),
        attributes: z.record(z.string(), z.unknown()),
        composition: z.array(z.object({ category: z.string(), value: z.string(), code: z.string(), notes: z.string().optional() })),
        description: z.string().optional(),
    }).strict(),
}).strict();
const deleteSchema = z.object({ ...scope, ids: z.array(z.string().uuid()).min(1).max(500) }).strict();

async function handle(request: NextRequest, mode: 'create' | 'delete') {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    if (!await getUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (mode === 'create') {
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: 'Invalid sample draft' }, { status: 400 });
        const { groupId, logbookId, requestId, input } = parsed.data;
        const result = await createSampleRecord({ ...input, group_id: groupId }, logbookId, requestId);
        if (result.error) return NextResponse.json(result, { status: 400 });
        revalidatePath(`/${groupId}/samples`);
        return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid sample selection' }, { status: 400 });
    const { groupId, logbookId, ids } = parsed.data;
    const result = await deleteSampleRecords(groupId, logbookId, ids);
    if (result.error) return NextResponse.json(result, { status: 400 });
    revalidatePath(`/${groupId}/samples`);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) { return handle(request, 'create'); }
export async function DELETE(request: NextRequest) { return handle(request, 'delete'); }
