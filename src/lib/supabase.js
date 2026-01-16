
import { createBrowserClient } from '@supabase/ssr';

const containerUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const containerKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Singleton pattern to prevent multiple instances
let supabaseInstance = null;

export const supabase = (() => {
    if (!supabaseInstance) {
        supabaseInstance = createBrowserClient(containerUrl, containerKey)
    }
    return supabaseInstance;
})();
