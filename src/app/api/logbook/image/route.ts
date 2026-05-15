import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('file_id');

    if (!fileId) return new NextResponse('Missing file_id', { status: 400 });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return new NextResponse('Missing BOT_TOKEN', { status: 500 });

    try {
        // 1. Get file path from Telegram
        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json();
        const filePath = fileData.result?.file_path;

        if (!filePath) return new NextResponse('File not found in Telegram', { status: 404 });

        const telegramUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
        
        // 2. Handle Range requests for Tauri/WebView2 compatibility
        const range = req.headers.get('range');
        
        const fetchOptions: RequestInit = {
            method: 'GET',
            headers: range ? { 'Range': range } : {}
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
            'Cache-Control': 'public, max-age=86400, immutable',
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

    } catch (e) {
        console.error("Telegram proxy error:", e);
        return new NextResponse('Internal error downloading media', { status: 500 });
    }
}
