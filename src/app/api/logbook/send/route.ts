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
    const { text, groupId } = body;

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

    // 1. Save to DB directly
    const { data: entry, error: dbError } = await supabase
        .from("logbook_entries")
        .insert({
            group_id: groupId,
            user_id: user.id,
            content: text.trim(),
            entry_type: "text",
            media_files: [],
            tags,
            links,
            source: "web",
        })
        .select()
        .single();

    if (dbError) {
        console.error("DB insert error:", dbError);
        return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    // 2. Mirror to Telegram (fire & forget — don't fail if Telegram is down)
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (botToken && chatId) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: `📓 *Bitácora (web)*\n\n${text.trim()}`,
                    parse_mode: "Markdown",
                }),
            });
        }
    } catch (err) {
        console.error("Telegram mirror error (non-fatal):", err);
    }

    return NextResponse.json({ success: true, entry });
}
