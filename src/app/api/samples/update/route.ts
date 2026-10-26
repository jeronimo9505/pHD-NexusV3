import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '@/lib/supabase/server';
import { updateSampleRecord } from '@/features/samples/server/update-sample';

const bodySchema = z.object({
    groupId: z.string().uuid(),
    input: z.object({
        id: z.string().uuid(),
        attributes: z.record(z.string(), z.unknown()).optional(),
        status: z.enum(['active', 'archived', 'consumed', 'in_progress', 'completed', 'successful', 'terminated']).optional(),
        composition: z.array(z.object({ category: z.string(), value: z.string(), code: z.string(), notes: z.string().optional() })).optional(),
        name: z.string().optional(), sample_code: z.string().optional(), description: z.string().optional(),
    }).strict(),
}).strict();

export async function PATCH(request: NextRequest) {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) {
        return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    }
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid sample update' }, { status: 400 });
    const { input, groupId } = parsed.data;
    // The session client retains RLS; both reads and writes also match group_id.
    const result = await updateSampleRecord(input, groupId, user.id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    // A Route Handler invalidates future reads without rerendering the whole
    // current page. The caller applies the single confirmed database row.
    revalidatePath(`/${groupId}/samples`);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
