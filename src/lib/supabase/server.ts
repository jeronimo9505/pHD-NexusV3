import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Database } from "@/types/supabase";
import { cache } from "react";

/**
 * Creates a Supabase server client. Wrapped with React.cache() so that
 * multiple calls within the same server request (layout + page + actions)
 * reuse the exact same client instance — eliminating redundant cookie parsing
 * and connection overhead.
 */
export const createClient = cache(async () => {
    const cookieStore = await cookies();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error(
            "Supabase URL or Anon Key is missing. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your .env.local file."
        );
    }

    return createServerClient<Database>(
        supabaseUrl,
        supabaseKey,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    );
});

/**
 * Returns the currently authenticated user. Wrapped with cache() so that
 * multiple calls within the same request (e.g. layout + page) resolve from
 * the same promise, avoiding redundant round trips to Supabase Auth.
 */
export const getUser = cache(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
});
