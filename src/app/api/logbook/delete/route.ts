import { createClient, getUser } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE(req: Request) {
    try {
        const user = await getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = await createClient();
        const { id, groupId } = await req.json();

        if (!id || !groupId) {
            return NextResponse.json({ error: 'Missing ID or GroupID' }, { status: 400 });
        }
        const { data: membership } = await supabase.from('group_members').select('id')
            .eq('group_id', groupId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
        if (!membership) return NextResponse.json({ error: 'Active group membership required' }, { status: 403 });

        // 1. Get telegram info before deleting
        const { data: entry } = await (supabase as any)
            .from('logbook_entries')
            .select('id, telegram_message_id, telegram_chat_id')
            .eq('id', id)
            .eq('group_id', groupId)
            .single();
        if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

        // 2. Delete from DB
        const { data: deleted, error } = await (supabase as any)
            .from('logbook_entries')
            .delete()
            .eq('id', id)
            .eq('group_id', groupId).select('id').maybeSingle();

        if (error) throw error;
        if (!deleted) return NextResponse.json({ error: 'Entry was not deleted' }, { status: 403 });

        // 3. Sync deletion to Telegram
        const chatId = entry?.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;
        if (entry?.telegram_message_id && chatId) {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            if (botToken) {
                try {
                    await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId.toString(),
                            message_id: entry.telegram_message_id
                        })
                    });
                } catch {
                    console.error("Telegram delete sync failed; credential-bearing request details omitted");
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
