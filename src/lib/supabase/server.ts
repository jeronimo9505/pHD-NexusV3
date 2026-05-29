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
    try {
        const cookieStore = await cookies();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        // Prefer service role key for server‑side operations; fall back to anon key for public access.
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error("Supabase URL or key is missing from environment variables.");
            throw new Error(
                "Supabase URL or key is missing. Ensure NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY are set."
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
    } catch (e) {
        console.error("Failed to initialize Supabase server client:", e);
        throw e;
    }
});

/**
 * Returns the currently authenticated user. Wrapped with cache() so that
 * multiple calls within the same request (e.g. layout + page) resolve from
 * the same promise, avoiding redundant round trips to Supabase Auth.
 */
export const getUser = cache(async () => {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.getUser();

        if (error) {
            console.warn("Supabase auth.getUser() returned an error:", error.message);
            return null;
        }

        return data?.user || null;
    } catch (e) {
        console.error("Unexpected error in getUser helper:", e);
        return null;
    }
});
