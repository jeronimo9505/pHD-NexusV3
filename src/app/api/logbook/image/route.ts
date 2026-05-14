import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('file_id');

    if (!fileId) return new NextResponse('Missing file_id', { status: 400 });

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '8712905649:AAGZaZgFanJ3ALFVPdJHRUizQmlEjaxUKl8';
    if (!botToken) return new NextResponse('Missing BOT_TOKEN', { status: 500 });

    try {
        // 1. Get file path from Telegram
        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json();
        const filePath = fileData.result?.file_path;

        if (!filePath) return new NextResponse('File not found in Telegram', { status: 404 });

        // 2. Download binary from Telegram
        const imgRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
        const buffer = await imgRes.arrayBuffer();

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'image/jpeg',
                // Cache heavily since Telegram file_id implies immutable content
                'Cache-Control': 'public, max-age=86400, immutable'
            }
        });
    } catch (e) {
        console.error("Telegram proxy error:", e);
        return new NextResponse('Internal error downloading image', { status: 500 });
    }
}
