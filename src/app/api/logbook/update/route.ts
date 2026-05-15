import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";

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

export async function PATCH(req: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, text, groupId } = await req.json();
    const cleanText = typeof text === "string" ? text.trim() : "";

    if (!id || !groupId || !cleanText) {
        return NextResponse.json({ error: "Missing id, text or groupId" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: entry, error } = await (supabase as any)
        .from("logbook_entries")
        .update({
            content: cleanText,
            tags: parseTags(cleanText),
            links: parseLinks(cleanText),
        })
        .eq("id", id)
        .eq("group_id", groupId)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, entry });
}
