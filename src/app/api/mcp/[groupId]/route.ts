import { isGroupOwner } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ─── MCP-compatible Tool Manifest ────────────────────────────────────

const TOOLS = [
    {
        name: 'get_samples_this_week',
        description: 'Returns samples created in the last 7 days for this research group.',
        inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'get_samples_by_date_range',
        description: 'Returns samples created between two dates.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
                end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
            },
            required: ['start_date', 'end_date']
        }
    },
    {
        name: 'get_samples_by_characterization_type',
        description: 'Returns samples with a specific characterization type (e.g. Raman, SEM, AFM, XRD).',
        inputSchema: {
            type: 'object',
            properties: {
                char_type: { type: 'string', description: 'Characterization type' }
            },
            required: ['char_type']
        }
    },
    {
        name: 'get_sample_detail',
        description: 'Returns full detail for a specific sample by its code.',
        inputSchema: {
            type: 'object',
            properties: {
                sample_code: { type: 'string', description: 'Sample code e.g. S1, G2' }
            },
            required: ['sample_code']
        }
    },
    {
        name: 'get_samples_stats',
        description: 'Returns sample statistics: total count, by status, by type, characterization types.',
        inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'get_tasks',
        description: 'Returns tasks. Filter by status: todo, in_progress, done, all.',
        inputSchema: {
            type: 'object',
            properties: {
                status_filter: { type: 'string', enum: ['todo', 'in_progress', 'done', 'all'] }
            },
            required: []
        }
    },
    {
        name: 'get_tasks_overdue',
        description: 'Returns overdue tasks (past due date, not completed).',
        inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'get_knowledge_items',
        description: 'Returns knowledge base items. Filter by category: protocol, reference, note, resource.',
        inputSchema: {
            type: 'object',
            properties: {
                category: { type: 'string', enum: ['protocol', 'reference', 'note', 'resource', 'all'] }
            },
            required: []
        }
    },
    {
        name: 'get_reports_summary',
        description: 'Returns recent weekly reports and drive reports for the group.',
        inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'get_activity_recent',
        description: 'Returns recent activity log from the group.',
        inputSchema: { type: 'object', properties: {}, required: [] }
    },
];

// ─── Auth guard ───────────────────────────────────────────────────────

async function guardOwner(groupId: string) {
    const owner = await isGroupOwner(groupId);
    if (!owner) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    return null;
}

// ─── Tool executor ───────────────────────────────────────────────────

async function executeTool(toolName: string, args: Record<string, any>, groupId: string) {
    const supabase = await createClient();

    switch (toolName) {

        case 'get_samples_this_week': {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const { data, error } = await supabase
                .from('samples')
                .select('display_id, name, status, type, composition, created_at')
                .eq('group_id', groupId)
                .gte('created_at', weekAgo.toISOString())
                .order('created_at', { ascending: false });
            if (error) return { error: error.message };
            return { samples: data, count: data?.length };
        }

        case 'get_samples_by_date_range': {
            const { start_date, end_date } = args;
            const { data, error } = await supabase
                .from('samples')
                .select('display_id, name, status, type, composition, created_at')
                .eq('group_id', groupId)
                .gte('created_at', new Date(start_date).toISOString())
                .lte('created_at', new Date(end_date + 'T23:59:59').toISOString())
                .order('created_at', { ascending: false });
            if (error) return { error: error.message };
            return { samples: data, count: data?.length, start_date, end_date };
        }

        case 'get_samples_by_characterization_type': {
            const { char_type } = args;
            const { data, error } = await supabase
                .from('sample_characterizations')
                .select('sample:sample_id(display_id, name, status, composition), type, performed_at')
                .eq('type', char_type)
                .order('performed_at', { ascending: false })
                .limit(50);
            if (error) return { error: error.message };
            const seen = new Set();
            const samples = (data || [])
                .filter((c: any) => c.sample && !seen.has(c.sample.display_id) && seen.add(c.sample.display_id))
                .map((c: any) => c.sample);
            return { samples, count: samples.length, characterization_type: char_type };
        }

        case 'get_sample_detail': {
            const { sample_code } = args;
            const { data, error } = await supabase
                .from('samples')
                .select('*, characterizations:sample_characterizations(type, data, performed_at, created_at)')
                .eq('group_id', groupId)
                .or(`display_id.eq.${sample_code},sample_code.eq.${sample_code}`)
                .single();
            if (error) return { error: 'Sample not found' };
            return { sample: data };
        }

        case 'get_samples_stats': {
            const [totalRes, byStatusRes, byTypeRes, charRes] = await Promise.all([
                supabase.from('samples').select('*', { count: 'exact', head: true }).eq('group_id', groupId),
                supabase.from('samples').select('status').eq('group_id', groupId),
                supabase.from('samples').select('type').eq('group_id', groupId),
                supabase.from('sample_characterizations').select('type').limit(200),
            ]);
            const byStatus: Record<string, number> = {};
            (byStatusRes.data || []).forEach((s: any) => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });
            const byType: Record<string, number> = {};
            (byTypeRes.data || []).forEach((s: any) => { byType[s.type] = (byType[s.type] || 0) + 1; });
            const charByType: Record<string, number> = {};
            (charRes.data || []).forEach((c: any) => { charByType[c.type] = (charByType[c.type] || 0) + 1; });
            return { total: totalRes.count, by_status: byStatus, by_type: byType, characterizations: charByType };
        }

        case 'get_tasks': {
            let query = supabase.from('tasks')
                .select('title, status, priority, due_date, created_at')
                .eq('group_id', groupId)
                .order('created_at', { ascending: false })
                .limit(50);
            if (args.status_filter && args.status_filter !== 'all') query = query.eq('status', args.status_filter);
            const { data, error } = await query;
            if (error) return { error: error.message };
            return { tasks: data, count: data?.length };
        }

        case 'get_tasks_overdue': {
            const { data, error } = await supabase
                .from('tasks')
                .select('title, status, priority, due_date')
                .eq('group_id', groupId)
                .lt('due_date', new Date().toISOString())
                .neq('status', 'done')
                .order('due_date', { ascending: true });
            if (error) return { error: error.message };
            return { overdue_tasks: data, count: data?.length };
        }

        case 'get_knowledge_items': {
            let query = supabase.from('knowledge_items')
                .select('title, category, tags, created_at')
                .eq('group_id', groupId)
                .order('created_at', { ascending: false })
                .limit(20);
            if (args.category && args.category !== 'all') query = query.eq('category', args.category);
            const { data, error } = await query;
            if (error) return { error: error.message };
            return { items: data, count: data?.length };
        }

        case 'get_reports_summary': {
            const [reports, drive] = await Promise.all([
                supabase.from('reports').select('week_start, week_end, status, created_at').eq('group_id', groupId).order('created_at', { ascending: false }).limit(10),
                supabase.from('drive_reports').select('title, type, status, created_at').eq('group_id', groupId).order('created_at', { ascending: false }).limit(10),
            ]);
            return { reports: reports.data, drive_reports: drive.data };
        }

        case 'get_activity_recent': {
            const { data, error } = await supabase
                .from('activity_log')
                .select('action, entity_type, created_at')
                .eq('group_id', groupId)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) return { error: error.message };
            return { activity: data };
        }

        default:
            return { error: `Unknown tool: ${toolName}` };
    }
}

// ─── GET — Tool Manifest ──────────────────────────────────────────────

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    const { groupId } = await params;
    const guard = await guardOwner(groupId);
    if (guard) return guard;

    return NextResponse.json({
        schema_version: '1',
        name: 'phd-nexus-mcp',
        description: 'MCP server for pHD Nexus — provides read access to research group data: samples, characterizations, tasks, knowledge base, and reports.',
        tools: TOOLS
    });
}

// ─── POST — Tool Execution ────────────────────────────────────────────

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    const { groupId } = await params;
    const guard = await guardOwner(groupId);
    if (guard) return guard;

    const body = await request.json();
    const { tool, arguments: args } = body;

    if (!tool) {
        return NextResponse.json({ error: 'Missing tool name' }, { status: 400 });
    }

    const result = await executeTool(tool, args || {}, groupId);
    return NextResponse.json(result);
}
