import { Database } from "@/types/supabase";

export type RegularReport = Database['public']['Tables']['reports']['Row'] & {
    author?: { full_name: string | null; avatar_url: string | null };
    sections?: Database['public']['Tables']['report_sections']['Row'][];
};
