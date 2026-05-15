import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";

// Inline tag/link parsers (mirrors Edge Function logic)
function parseTags(text: string): string[] {
    const matches = text.match(/#[\w\u00C0-\u017F]+/g) || [];
    return [...new Set(matches.map(t => t.slice(1).toLowerCase()))];
}

function parseLinks(text: string): Array<{ type: string; ref: string; label: string }> {
    const re = /\[(muestra|tarea|reporte|sample|task|report):([\w-]+)\]/gi;
    const links: Array<{ type: string; ref: string; label: string }> = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        links.push({ type: m[1].toLowerCase(), ref: m[2], label: `${m[1]}: ${m[2]}` });
    }
    return links;
}

export async function POST(req: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { text, groupId, parentId } = body;

    if (!text?.trim() || !groupId) {
        return NextResponse.json({ error: "Missing text or groupId" }, { status: 400 });
    }

    const supabase = await createClient();

    // Get user profile
    const { data: profile } = await supabase
        .from("profiles")
        .select("id, default_group_id")
        .eq("id", user.id)
        .single();

    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const tags = parseTags(text);
    const links = parseLinks(text);

    // --- AUTOMATIC TASK CREATION LOGIC ---
    let createdTaskId: string | null = null;
    const isTaskCommand = text.trim().startsWith('..');

    if (isTaskCommand) {
        try {
            const cleanText = text.trim().slice(2).trim(); // Remove '..'
            
            // Priority detection
            let priority: 'low' | 'medium' | 'high' = 'medium';
            const lowerText = text.toLowerCase();
            if (lowerText.includes('#urgente') || lowerText.includes('#alta') || lowerText.includes('#high')) {
                priority = 'high';
            } else if (lowerText.includes('#baja') || lowerText.includes('#low')) {
                priority = 'low';
            }

            // Remove priority tags from title to keep it clean
            const title = cleanText
                .replace(/#urgente|#alta|#high|#baja|#low/gi, '')
                .trim() || "Untitled Task from Logbook";

            const { data: newTask, error: taskError } = await supabase
                .from('tasks')
                .insert({
                    group_id: groupId,
                    title: title,
                    description: `Created via Logbook command: "${text.trim()}"`,
                    status: 'todo',
                    priority: priority,
                    created_by: user.id,
                    subtasks: []
                })
                .select('id')
                .single();

            if (taskError) {
                console.error("Task creation error:", taskError);
            } else if (newTask) {
                createdTaskId = newTask.id;
                // Add assignee (default to creator)
                await supabase.from('task_assignees').insert({
                    task_id: createdTaskId,
                    user_id: user.id
                });
            }
        } catch (err) {
            console.error("Task processing error:", err);
        }
    }

    // 1. Save to DB directly
    const cleanLogbookText = isTaskCommand ? text.trim().slice(2).trim() : text.trim();

    const insertData: any = {
        group_id: groupId,
        user_id: user.id,
        content: cleanLogbookText,
        entry_type: isTaskCommand ? "task_command" : "text",
        media_files: [],
        tags,
        links,
        source: "web",
        parent_id: parentId || null,
        metadata: createdTaskId ? { task_id: createdTaskId } : null
    };

    const { data: entry, error: dbError } = await supabase
        .from("logbook_entries")
        .insert(insertData)
        .select()
        .single();

    if (dbError) {
        console.error("DB insert error:", dbError);
        // Try one more time without metadata if it failed
        if (insertData.metadata) {
            const { data: retryEntry, error: retryError } = await supabase
                .from("logbook_entries")
                .insert({ ...insertData, metadata: null })
                .select()
                .single();
            
            if (retryError) return NextResponse.json({ error: retryError.message }, { status: 500 });
            return NextResponse.json({ success: true, entry: retryEntry });
        }
        return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // 2. Mirror to Telegram (fire & forget)
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (botToken && chatId) {
            const telegramPayload: any = {
                chat_id: chatId,
                text: parentId ? text.trim() : `📓 *Bitácora (web)*\n\n${text.trim()}`,
                parse_mode: "Markdown",
            };

            // If it's a reply, try to link it in Telegram too
            if (parentId) {
                const { data: parent } = await supabase
                    .from("logbook_entries")
                    .select("telegram_message_id")
                    .eq("id", parentId)
                    .single();
                
                if (parent?.telegram_message_id) {
                    telegramPayload.reply_to_message_id = parent.telegram_message_id;
                }
            }

            const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(telegramPayload),
            });

            if (tgRes.ok) {
                const tgData = await tgRes.json();
                const telegramMessageId = tgData.result?.message_id;
                
                if (telegramMessageId) {
                    // Update our DB with the Telegram message ID so we can reply to it later
                    await supabase
                        .from("logbook_entries")
                        .update({ telegram_message_id: telegramMessageId })
                        .eq("id", entry.id);
                }
            }
        }
    } catch (err) {
        console.error("Telegram mirror error (non-fatal):", err);
    }

    return NextResponse.json({ success: true, entry });
}
