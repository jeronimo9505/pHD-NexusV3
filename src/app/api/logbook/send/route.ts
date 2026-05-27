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

    let text = "";
    let groupId = "";
    let parentId: string | null = null;
    let imageFile: File | null = null;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        text = (formData.get("text") as string) || "";
        groupId = (formData.get("groupId") as string) || "";
        parentId = (formData.get("parentId") as string) || null;
        imageFile = (formData.get("image") as File) || null;
    } else {
        const body = await req.json();
        text = body.text || "";
        groupId = body.groupId || "";
        parentId = body.parentId || null;
    }

    if (!text?.trim() && !imageFile) {
        return NextResponse.json({ error: "Missing text or image" }, { status: 400 });
    }

    if (!groupId) {
        return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
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

    const cleanLogbookText = isTaskCommand ? text.trim().slice(2).trim() : text.trim();

    // --- TELEGRAM PHOTO UPLOAD FIRST ---
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    let telegramMessageId: number | null = null;
    let mediaFiles: any[] = [];

    if (imageFile && botToken && chatId) {
        try {
            const tgFormData = new FormData();
            tgFormData.append('chat_id', chatId);
            tgFormData.append('caption', parentId ? text.trim() : `📓 *Bitácora (web)*\n\n${text.trim()}`);
            tgFormData.append('parse_mode', 'Markdown');
            
            // Append file
            tgFormData.append('photo', imageFile);

            if (parentId) {
                const { data: parent } = await (supabase as any)
                    .from("logbook_entries")
                    .select("telegram_message_id")
                    .eq("id", parentId)
                    .single();
                
                if (parent?.telegram_message_id) {
                    tgFormData.append('reply_to_message_id', parent.telegram_message_id.toString());
                }
            }

            const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                method: "POST",
                body: tgFormData
            });

            if (tgRes.ok) {
                const tgData = await tgRes.json();
                telegramMessageId = tgData.result?.message_id || null;
                const photoArray = tgData.result?.photo;
                if (photoArray && photoArray.length > 0) {
                    const fileId = photoArray[photoArray.length - 1].file_id;
                    mediaFiles = [{
                        type: 'image',
                        telegram_file_id: fileId
                    }];
                }
            } else {
                const tgErrText = await tgRes.text();
                console.error("Telegram sendPhoto failed:", tgErrText);
            }
        } catch (err) {
            console.error("Telegram image upload error:", err);
        }
    }

    // 1. Save to DB directly
    const insertData: any = {
        group_id: groupId,
        user_id: user.id,
        content: cleanLogbookText,
        entry_type: isTaskCommand ? "task_command" : "text",
        media_files: mediaFiles,
        tags,
        links,
        source: "web",
        parent_id: parentId || null,
        metadata: createdTaskId ? { task_id: createdTaskId } : null
    };

    if (telegramMessageId) {
        insertData.telegram_message_id = telegramMessageId;
        if (chatId) {
            insertData.telegram_chat_id = chatId;
        }
    }

    const { data: entry, error: dbError } = await (supabase as any)
        .from("logbook_entries")
        .insert(insertData)
        .select()
        .single();

    if (dbError) {
        console.error("DB insert error:", dbError);
        // Try one more time without metadata if it failed
        if (insertData.metadata) {
            const { data: retryEntry, error: retryError } = await (supabase as any)
                .from("logbook_entries")
                .insert({ ...insertData, metadata: null })
                .select()
                .single();
            
            if (retryError) return NextResponse.json({ error: retryError.message }, { status: 500 });
            return NextResponse.json({ success: true, entry: retryEntry });
        }
        return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // 2. Mirror to Telegram (fire & forget) - ONLY if not already sent as a photo
    if (!telegramMessageId && botToken && chatId) {
        try {
            const telegramPayload: any = {
                chat_id: chatId,
                text: parentId ? text.trim() : `📓 *Bitácora (web)*\n\n${text.trim()}`,
                parse_mode: "Markdown",
            };

            // If it's a reply, try to link it in Telegram too
            if (parentId) {
                const { data: parent } = await (supabase as any)
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
                const freshTgMsgId = tgData.result?.message_id;
                
                if (freshTgMsgId) {
                    await (supabase as any)
                        .from("logbook_entries")
                        .update({ 
                            telegram_message_id: freshTgMsgId,
                            telegram_chat_id: chatId
                        })
                        .eq("id", entry.id);
                }
            }
        } catch (err) {
            console.error("Telegram mirror error (non-fatal):", err);
        }
    }

    return NextResponse.json({ success: true, entry });
}
