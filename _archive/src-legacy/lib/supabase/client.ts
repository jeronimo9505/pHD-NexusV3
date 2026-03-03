import { createBrowserClient } from '@supabase/ssr';

// Singleton instance
let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Get the canonical Supabase client for browser usage.
 * This is a singleton to ensure consistent cache and auth state across the app.
 * 
 * @returns Supabase client instance
 */
export function getSupabaseClient() {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase environment variables. Please check your .env file.'
    );
  }

  supabaseInstance = createBrowserClient(url, key);
  return supabaseInstance;
}

/**
 * Canonical Supabase client - use this throughout the application.
 * 
 * Usage:
 * ```typescript
 * import { supabase } from '@/lib/supabase/client';
 * 
 * const { data, error } = await supabase.from('reports').select('*');
 * ```
 */
export const supabase = getSupabaseClient();
