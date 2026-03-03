import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
    // Update session and check for user
    const { response, user } = await updateSession(request)

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
