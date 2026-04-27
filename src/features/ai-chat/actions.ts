'use server';

import { createClient } from "@/lib/supabase/server";
import { isGroupOwner } from "@/lib/auth/roles";
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType, Content } from "@google/generative-ai";
import { revalidatePath } from "next/cache";

// ─── CHAT HISTORY PERSISTENCE ──────────────────────────────────────

export async function getChatSessionsAction(groupId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { data, error } = await supabase
        .from('ai_chat_sessions')
        .select('id, title, created_at, updated_at')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(30);

    if (error) return { error: error.message };
    return { data };
}

export async function getChatMessagesAction(sessionId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { data, error } = await supabase
        .from('ai_chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

    if (error) return { error: error.message };
    return { data };
}

export async function createChatSessionAction(groupId: string, title: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { data, error } = await supabase
        .from('ai_chat_sessions')
        .insert({ group_id: groupId, user_id: user.id, title })
        .select()
        .single();

    if (error) return { error: error.message };
    return { data };
}

export async function deleteChatSessionAction(sessionId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { error } = await supabase
        .from('ai_chat_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', user.id);

    if (error) return { error: error.message };
    return { success: true };
}

// ─── MCP TOOL EXECUTORS ──────────────────────────────────────────────

async function executeToolCall(toolName: string, args: Record<string, any>, groupId: string) {
    const supabase = await createClient();

    switch (toolName) {

        case 'get_samples_this_week': {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const { data, error } = await supabase
                .from('samples')
                .select('display_id, name, status, type, composition, created_at, created_by_user:created_by(full_name)')
                .eq('group_id', groupId)
                .gte('created_at', weekAgo.toISOString())
                .order('created_at', { ascending: false });
            if (error) return { error: error.message };
            return { samples: data, count: data?.length || 0, period: 'last 7 days' };
        }

        case 'get_samples_by_date_range': {
            const { start_date, end_date } = args;
            const { data, error } = await supabase
                .from('samples')
                .select('display_id, name, status, type, composition, created_at, created_by_user:created_by(full_name)')
                .eq('group_id', groupId)
                .gte('created_at', new Date(start_date).toISOString())
                .lte('created_at', new Date(end_date + 'T23:59:59').toISOString())
                .order('created_at', { ascending: false });
            if (error) return { error: error.message };
            return { samples: data, count: data?.length || 0, start_date, end_date };
        }

        case 'get_samples_by_characterization_type': {
            const { char_type } = args;
            const { data, error } = await supabase
                .from('sample_characterizations')
                .select('sample:sample_id(display_id, name, status, composition), type, data, performed_at, created_at')
                .eq('type', char_type)
                .order('created_at', { ascending: false })
                .limit(50);
            if (error) return { error: error.message };
            // Group by sample
            const samplesMap = new Map();
            (data || []).forEach((c: any) => {
                if (c.sample) {
                    const key = c.sample.display_id;
                    if (!samplesMap.has(key)) samplesMap.set(key, { ...c.sample, characterizations: [] });
                    samplesMap.get(key).characterizations.push({ performed_at: c.performed_at, data: c.data });
                }
            });
            return { samples: Array.from(samplesMap.values()), characterization_type: char_type, count: samplesMap.size };
        }

        case 'get_sample_detail': {
            const { sample_code } = args;
            const { data, error } = await (supabase
                .from('samples')
                .select(`*, 
                    parent:parent_id(display_id, name),
                    created_by_user:created_by(full_name, email),
                    characterizations:sample_characterizations(type, data, performed_at, created_at),
                    raman:raman_measurements(technique, laser_wavelength_nm, laser_power_uw, integration_time_s, accumulations, objective, notes, measured_at)
                `)
                .eq('group_id', groupId)
                .or(`display_id.eq.${sample_code},sample_code.eq.${sample_code}`)
                .single()) as any;
            if (error) return { error: 'Sample not found' };
            return { sample: data };
        }

        case 'get_raman_measurements': {
            const { sample_code, limit = 10 } = args;
            let query = (supabase
                .from('raman_measurements')
                .select(`*, sample:sample_id(display_id, name)`)
                .eq('group_id', groupId)
                .order('measured_at', { ascending: false })
                .limit(limit)) as any;

            if (sample_code) {
                // Find sample ID first
                const { data: s } = await supabase.from('samples').select('id').or(`display_id.eq.${sample_code},sample_code.eq.${sample_code}`).single();
                if (s) query = query.eq('sample_id', s.id);
            }

            const { data, error } = await query;
            if (error) return { error: error.message };
            return { raman_measurements: data, count: data?.length || 0 };
        }

        case 'search_samples': {
            const { query } = args;
            const { data, error } = await supabase
                .from('samples')
                .select('display_id, name, type, status, composition, created_at')
                .eq('group_id', groupId)
                .or(`display_id.ilike.%${query}%,name.ilike.%${query}%,description.ilike.%${query}%`)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) return { error: error.message };
            return { samples: data, count: data?.length || 0, search_query: query };
        }

        case 'get_samples_stats': {
            const [totalRes, byStatusRes, byTypeRes, charRes, recentRes] = await Promise.all([
                supabase.from('samples').select('*', { count: 'exact', head: true }).eq('group_id', groupId),
                supabase.from('samples').select('status').eq('group_id', groupId),
                supabase.from('samples').select('type').eq('group_id', groupId),
                supabase.from('sample_characterizations')
                    .select('type, created_at')
                    .order('created_at', { ascending: false })
                    .limit(100),
                supabase.from('samples').select('display_id, name, created_at')
                    .eq('group_id', groupId)
                    .order('created_at', { ascending: false })
                    .limit(5),
            ]);

            const byStatus: Record<string, number> = {};
            (byStatusRes.data || []).forEach((s: any) => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });
            const byType: Record<string, number> = {};
            (byTypeRes.data || []).forEach((s: any) => { byType[s.type] = (byType[s.type] || 0) + 1; });
            const charByType: Record<string, number> = {};
            (charRes.data || []).forEach((c: any) => { charByType[c.type] = (charByType[c.type] || 0) + 1; });

            return {
                total_samples: totalRes.count || 0,
                by_status: byStatus,
                by_type: byType,
                characterization_types: charByType,
                most_recent: recentRes.data,
            };
        }

        case 'get_tasks': {
            const { status_filter } = args;
            let query = supabase
                .from('tasks')
                .select('title, description, status, priority, due_date, created_at, assignees:task_assignees(profile:profiles(full_name))')
                .eq('group_id', groupId)
                .order('created_at', { ascending: false })
                .limit(50);
            if (status_filter && status_filter !== 'all') {
                query = query.eq('status', status_filter);
            }
            const { data, error } = await query;
            if (error) return { error: error.message };
            return { tasks: data, count: data?.length || 0, filter: status_filter || 'all' };
        }

        case 'get_tasks_overdue': {
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from('tasks')
                .select('title, status, priority, due_date, assignees:task_assignees(profile:profiles(full_name))')
                .eq('group_id', groupId)
                .lt('due_date', now)
                .neq('status', 'done')
                .order('due_date', { ascending: true });
            if (error) return { error: error.message };
            return { overdue_tasks: data, count: data?.length || 0 };
        }

        case 'get_knowledge_items': {
            const { category } = args;
            let query = supabase
                .from('knowledge_items')
                .select('title, content, category, tags, url, drive_file_id, created_at')
                .eq('group_id', groupId)
                .order('created_at', { ascending: false })
                .limit(20);
            if (category && category !== 'all') {
                query = query.eq('category', category);
            }
            const { data, error } = await query;
            if (error) return { error: error.message };
            return { knowledge_items: data, count: data?.length || 0 };
        }

        case 'get_reports_summary': {
            const { data: reports, error } = await (supabase
                .from('reports')
                .select('id, week_start, week_end, status, author:author_id(full_name), created_at')
                .eq('group_id', groupId)
                .order('created_at', { ascending: false })
                .limit(10)) as any;
            const { data: driveReports, error: drErr } = await (supabase
                .from('drive_reports')
                .select('title, type, status, web_view_link, author:author_id(full_name), created_at')
                .eq('group_id', groupId)
                .order('created_at', { ascending: false })
                .limit(10)) as any;
            if (error || drErr) return { error: (error || drErr)?.message };
            return { reports, drive_reports: driveReports };
        }

        case 'get_activity_recent': {
            const { data, error } = await supabase
                .from('activity_log')
                .select('action, entity_type, created_at, user:user_id(full_name)')
                .eq('group_id', groupId)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) return { error: error.message };
            return { recent_activity: data };
        }

        default:
            return { error: `Unknown tool: ${toolName}` };
    }
}

// ─── TOOL DEFINITIONS FOR GEMINI ────────────────────────────────────

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
    {
        name: 'get_samples_this_week',
        description: 'Returns samples created in the last 7 days for this research group. Use when asked about recent samples, samples added this week, or what was added recently.',
        parameters: { type: SchemaType.OBJECT, properties: {}, required: [] }
    },
    {
        name: 'get_samples_by_date_range',
        description: 'Returns samples created between two dates.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                start_date: { type: SchemaType.STRING, description: 'Start date in YYYY-MM-DD format' },
                end_date: { type: SchemaType.STRING, description: 'End date in YYYY-MM-DD format' },
            },
            required: ['start_date', 'end_date']
        }
    },
    {
        name: 'get_samples_by_characterization_type',
        description: 'Returns samples that have a specific type of characterization (e.g., Raman, SEM, AFM, XRD, TEM, PL, etc.).',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                char_type: { type: SchemaType.STRING, description: 'Type of characterization, e.g. Raman, SEM, AFM, XRD' }
            },
            required: ['char_type']
        }
    },
    {
        name: 'get_sample_detail',
        description: 'Returns full details for a specific sample by its code or display ID (e.g. S1, S2-B1, etc.). Now includes associated Raman measurements and characterizations.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                sample_code: { type: SchemaType.STRING, description: 'Sample display code, e.g. S1, S-12, G2' }
            },
            required: ['sample_code']
        }
    },
    {
        name: 'get_raman_measurements',
        description: 'Returns Raman/SERS measurement conditions (laser power, wavelength, integration time, etc.) for samples. Use when asked about experimental conditions, laser power, or Raman details.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                sample_code: { type: SchemaType.STRING, description: 'Optional: Filter by sample code (e.g. S1)' },
                limit: { type: SchemaType.NUMBER, description: 'Optional: Limit results (default 10)' }
            },
            required: []
        }
    },
    {
        name: 'search_samples',
        description: 'Searches the sample database by name, description, or code. Use when searching for specific names or broad topics.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING, description: 'Search term' }
            },
            required: ['query']
        }
    },
    {
        name: 'get_samples_stats',
        description: 'Returns statistics and summary of all samples in the group: total count, count by status, count by type, characterization types available.',
        parameters: { type: SchemaType.OBJECT, properties: {}, required: [] }
    },
    {
        name: 'get_tasks',
        description: 'Returns tasks in the group. Can be filtered by status (todo, in_progress, done, all).',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                status_filter: { type: SchemaType.STRING, description: 'Filter by status: todo, in_progress, done, or all' }
            },
            required: []
        }
    },
    {
        name: 'get_tasks_overdue',
        description: 'Returns tasks that are past their due date and not yet completed.',
        parameters: { type: SchemaType.OBJECT, properties: {}, required: [] }
    },
    {
        name: 'get_knowledge_items',
        description: 'Returns items from the knowledge base. Can be filtered by category (protocol, reference, note, resource).',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                category: { type: SchemaType.STRING, description: 'Category: protocol, reference, note, resource, or all' }
            },
            required: []
        }
    },
    {
        name: 'get_reports_summary',
        description: 'Returns recent reports (standard weekly reports and drive-linked reports) for the group.',
        parameters: { type: SchemaType.OBJECT, properties: {}, required: [] }
    },
    {
        name: 'get_activity_recent',
        description: 'Returns recent activity log of actions performed by group members.',
        parameters: { type: SchemaType.OBJECT, properties: {}, required: [] }
    },
];

// ─── MAIN CHAT ACTION ────────────────────────────────────────────────

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    created_at?: string;
}

export async function sendAIChatMessageAction(input: {
    groupId: string;
    sessionId: string | null;
    message: string;
    history: ChatMessage[];
}) {
    const { groupId, message, history } = input;

    // 1. Auth & owner check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const isOwner = await isGroupOwner(groupId);
    if (!isOwner) return { error: 'Access denied. Only the group owner can use Nexus AI.' };

    // 2. Get/create session
    let sessionId = input.sessionId;
    if (!sessionId) {
        const title = message.length > 50 ? message.slice(0, 47) + '...' : message;
        const { data: session, error: sessionErr } = await supabase
            .from('ai_chat_sessions')
            .insert({ group_id: groupId, user_id: user.id, title })
            .select()
            .single();
        if (sessionErr) return { error: sessionErr.message };
        sessionId = session.id;
    }

    // 3. Save user message to DB
    await supabase.from('ai_chat_messages').insert({
        session_id: sessionId,
        role: 'user',
        content: message,
    });

    // Update session timestamp
    await supabase.from('ai_chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId);

    // 4. Call Gemini
    // Try to get key from group settings first, then env
    const { data: group } = await supabase
        .from('groups')
        .select('ai_settings')
        .eq('id', groupId)
        .single();

    const aiSettings = group?.ai_settings as { geminiApiKey?: string, model?: string } | null;
    const apiKey = aiSettings?.geminiApiKey || process.env.GOOGLE_GEMINI_API_KEY;
    const modelName = aiSettings?.model || 'gemini-2.0-flash-lite';

    if (!apiKey) return { error: 'Gemini API key not configured. Add it in Group Settings or as GOOGLE_GEMINI_API_KEY in server environment.' };

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: `You are Nexus AI, an intelligent research lab assistant for a PhD research group. You have access to the group's database through specialized tools.

Your personality:
- Precise and scientific in tone, but friendly and helpful
- Proactively use tools to answer questions about the lab's data
- Present data in clear, structured format (use markdown tables and lists when helpful)
- When showing sample lists, include sample codes, names, status, and relevant dates
- **IMPORTANT**: When the user asks for a report, file, or knowledge item, ALWAYS check if there is a 'web_view_link', 'url', or 'drive_file_id' available in the tool output and PROVIDE it as a clickable markdown link.
- Always answer in the same language the user asks in (Spanish or English)
- For questions about "this week" or "recently", use the get_samples_this_week tool
- Do not make up data — always use tools to fetch real information

Today's date is ${new Date().toLocaleDateString('en-CA')}.`,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    });

    // Build gemini history from our DB history (last 20 messages)
    const geminiHistory: Content[] = history.slice(-20).map((m) => {
        const role: 'user' | 'model' = m.role === 'user' ? 'user' : 'model';
        return {
            role,
            parts: [{ text: m.content }]
        };
    });

    const chat = model.startChat({ history: geminiHistory });

    try {
        let result = await chat.sendMessage(message);
        let response = result.response;

        // 5. Agentic loop: keep calling tools until model gives a text response
        let iterationCount = 0;
        while (response.candidates?.[0]?.content?.parts?.some((p: any) => p.functionCall) && iterationCount < 5) {
            iterationCount++;
            const toolCalls = response.candidates![0].content.parts
                .filter((p: any) => p.functionCall)
                .map((p: any) => p.functionCall!);

            // Execute all tool calls in parallel
            const toolResults = await Promise.all(
                toolCalls.map(async (tc: any) => {
                    const toolResult = await executeToolCall(tc.name, tc.args || {}, groupId);
                    return {
                        functionResponse: {
                            name: tc.name,
                            response: toolResult,
                        }
                    };
                })
            );

            result = await chat.sendMessage(toolResults);
            response = result.response;
        }

        const assistantText = response.text();

        // 6. Save assistant response to DB
        await supabase.from('ai_chat_messages').insert({
            session_id: sessionId,
            role: 'assistant',
            content: assistantText,
        });

        return { success: true, sessionId, message: assistantText };

    } catch (err: any) {
        console.error('Gemini error:', err);
        return { error: err.message || 'Failed to get AI response' };
    }
}
