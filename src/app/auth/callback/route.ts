import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    // Robust origin detection for Vercel and local environments
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
    const protocol = request.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    const origin = host ? `${protocol}://${host}` : new URL(request.url).origin;

    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/dashboard";
    const isPopup = searchParams.get("popup") === "1";

    if (code) {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            // Force direct redirect if coming from a local/desktop environment (localhost)
            // regardless of the isPopup flag, to avoid getting stuck in a dead-end popup window.
            const isLocal = origin.includes('localhost');
            const redirectTarget = (isPopup && !isLocal) ? `${origin}/auth/popup-close` : `${origin}${next}`;
            const response = NextResponse.redirect(redirectTarget);

            // If the user logged in with Google OAuth, the provider_token is the
            // Google access token (with Drive/Docs/Slides scopes). We pass it to
            // the client via a short-lived cookie so GoogleTokenSync can save it
            // to localStorage, eliminating the "Connect to Google" popup on every session.
            if (data?.session?.provider_token) {
                const expiryMs = data.session.expires_at
                    ? data.session.expires_at * 1000 - 60_000
                    : Date.now() + 3_540_000;

                response.cookies.set("google_provider_token", data.session.provider_token, {
                    httpOnly: false, // client JS needs to read this
                    sameSite: "lax",
                    path: "/",
                    maxAge: 3600,
                });

                response.cookies.set("google_provider_token_expiry", String(expiryMs), {
                    httpOnly: false,
                    sameSite: "lax",
                    path: "/",
                    maxAge: 3600,
                });
            }

            return response;
        }
    }

    return NextResponse.redirect(`${origin}/login?message=Could not verify email code`);
}
