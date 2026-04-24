import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
    // Fail-open if Supabase env vars are missing (prevents MIDDLEWARE_INVOCATION_FAILED)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        console.error('[middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
        return NextResponse.next()
    }

    let response: NextResponse
    let user: Awaited<ReturnType<typeof updateSession>>['user']
    try {
        ;({ response, user } = await updateSession(request))
    } catch (err) {
        console.error('[middleware] updateSession failed:', err)
        return NextResponse.next()
    }

    const path = request.nextUrl.pathname

    // 1. If user is signed in and visits login page, redirect to root (which acts as dispatcher)
    if (user && path.startsWith('/login')) {
        return NextResponse.redirect(new URL('/', request.url))
    }

    // 2. If user is NOT signed in and visits a protected page, redirect to login
    // Allowed paths: /login, /auth/*, static assets (handled by matcher)
    if (!user && !path.startsWith('/login') && !path.startsWith('/register') && !path.startsWith('/forgot-password') && !path.startsWith('/reset-password') && !path.startsWith('/auth') && !path.startsWith('/privacy') && !path.startsWith('/terms')) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - images, fonts, etc.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
