'use server';

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export async function signInAction(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return { error: error.message };
    }

    return { success: true };
}

export async function signUpAction(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const fullName = formData.get("full_name") as string;
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
                system_role: 'user', // Default role
            },
        },
    });

    if (error) {
        return { error: error.message };
    }

    if (data.session) {
        return { success: true };
    } else if (data.user) {
        // Email confirmation required case potentially
        return { success: true, message: 'Please check your email to confirm your account.' };
    }

    return { error: 'Unknown registration error' };
}

export async function getGoogleOAuthUrlAction(): Promise<{ url?: string; error?: string }> {
    const supabase = await createClient();

    // Determine the base URL dynamically based on the request host
    // This is crucial so that the OAuth callback matches the domain the user is visiting,
    // otherwise PKCE validation will fail due to cross-domain cookie issues.
    const headerList = await headers();
    const host = headerList.get('host') || headerList.get('x-forwarded-host');
    let origin = 'http://localhost:3000';

    if (host) {
        const protocol = host.includes('localhost') ? 'http' : 'https';
        origin = `${protocol}://${host}`;
    } else if (process.env.NEXT_PUBLIC_SITE_URL) {
        origin = process.env.NEXT_PUBLIC_SITE_URL;
    } else if (process.env.NEXT_PUBLIC_VERCEL_URL) {
        origin = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
    }

    // Remove trailing slash if present
    origin = origin.replace(/\/$/, '');

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: `${origin}/auth/callback?popup=1`,
            scopes: [
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/documents',
                'https://www.googleapis.com/auth/presentations',
                'https://www.googleapis.com/auth/drive.readonly',
            ].join(' '),
            queryParams: {
                access_type: 'offline',
                prompt: 'select_account',
            },
            skipBrowserRedirect: true,
        },
    });

    if (error || !data.url) {
        return { error: error?.message || 'Could not get Google auth URL' };
    }

    return { url: data.url };
}

