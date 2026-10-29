import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
    const user = await getUser();
    if (!user) return new NextResponse('Unauthorized', { status: 401 });
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('file_id');

    if (!fileId) return new NextResponse('Missing file_id', { status: 400 });
    const supabase = await createClient();
    const { data: entry, error: entryError } = await (supabase as any).from('logbook_entries')
        .select('id,group_id').contains('media_files', [{ telegram_file_id: fileId }]).limit(1).maybeSingle();
    if (entryError || !entry) return new NextResponse('Media not found', { status: 404 });
    const { data: membership } = await supabase.from('group_members').select('id')
        .eq('group_id', entry.group_id).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!membership) return new NextResponse('Media not found', { status: 404 });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return new NextResponse('Missing BOT_TOKEN', { status: 500 });

    try {
        // 1. Get file path from Telegram
        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`, { cache: 'no-store' });
        const fileData = await fileRes.json();
        const filePath = fileData.result?.file_path;

        if (!filePath) return new NextResponse('File not found in Telegram', { status: 404 });

        const telegramUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
        
        // 2. Handle Range requests for Tauri/WebView2 compatibility
        const range = req.headers.get('range');
        
        const fetchOptions: RequestInit = {
            method: 'GET',
            headers: range ? { 'Range': range } : {},
            cache: 'no-store'
        };

        const mediaRes = await fetch(telegramUrl, fetchOptions);
        
        if (!mediaRes.ok && mediaRes.status !== 206) {
            return new NextResponse('Failed to fetch from Telegram', { status: mediaRes.status });
        }

        const buffer = await mediaRes.arrayBuffer();

        // 3. Determine content type
        let contentType = mediaRes.headers.get('content-type') || 'application/octet-stream';
        if (filePath.toLowerCase().endsWith('.mp4')) contentType = 'video/mp4';
        else if (filePath.toLowerCase().endsWith('.jpg') || filePath.toLowerCase().endsWith('.jpeg')) contentType = 'image/jpeg';
        else if (filePath.toLowerCase().endsWith('.png')) contentType = 'image/png';

        // 4. Return with appropriate status and headers for Range support
        const responseHeaders = new Headers({
            'Content-Type': contentType,
            'Cache-Control': 'private, no-store',
            'Vary': 'Cookie',
            'Accept-Ranges': 'bytes',
        });

        const contentRange = mediaRes.headers.get('content-range');
        if (contentRange) responseHeaders.set('Content-Range', contentRange);
        
        const contentLength = mediaRes.headers.get('content-length');
        if (contentLength) responseHeaders.set('Content-Length', contentLength);

        return new NextResponse(buffer, {
            status: mediaRes.status,
            headers: responseHeaders
        });

    } catch {
        console.error("Telegram media request failed; credential-bearing request details omitted");
        return new NextResponse('Internal error downloading media', { status: 500 });
    }
}
