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

        // 1. Get telegram info before deleting
        const { data: entry } = await (supabase as any)
            .from('logbook_entries')
            .select('telegram_message_id, telegram_chat_id')
            .eq('id', id)
            .single();

        // 2. Delete from DB
        const { error } = await (supabase as any)
            .from('logbook_entries')
            .delete()
            .eq('id', id)
            .eq('group_id', groupId);

        if (error) throw error;

        // 3. Sync to Telegram if metadata exists
        if (entry?.telegram_message_id && entry?.telegram_chat_id) {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            if (botToken) {
                try {
                    await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: entry.telegram_chat_id,
                            message_id: entry.telegram_message_id
                        })
                    });
                } catch (tgError) {
                    console.error("Telegram delete sync error:", tgError);
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
