import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Bypass for local mode
    if (process.env.NEXT_PUBLIC_OPEN_MODE === 'true') {
        return response
    }

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // Protect routes - Basic Auth Guard
    if (request.nextUrl.pathname.startsWith('/dashboard') && !user) {
        return NextResponse.redirect(new URL('/login', request.url))
    }
    if (request.nextUrl.pathname.startsWith('/tasks') && !user) {
        return NextResponse.redirect(new URL('/login', request.url))
    }
    if (request.nextUrl.pathname.startsWith('/reports') && !user) {
        return NextResponse.redirect(new URL('/login', request.url))
    }
    if (request.nextUrl.pathname.startsWith('/settings') && !user) {
        return NextResponse.redirect(new URL('/login', request.url))
    }
    if (request.nextUrl.pathname.startsWith('/admin') && !user) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // RBAC Guard for Admin (Optional: Depends if we store role in metadata or just check DB in middleware)
    // For now, we rely on the component/layout level check or a server-side check after loading user.
    // Note: Middleware DB calls can be expensive.

    return response
}
