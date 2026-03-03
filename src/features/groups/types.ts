import { Database } from "@/types/supabase";

export type Group = Database['public']['Tables']['groups']['Row'];
export type GroupMember = Database['public']['Tables']['group_members']['Row'];

export type CreateGroupInput = {
    name: string;
    description?: string;
};

export type UpdateGroupInput = Partial<CreateGroupInput> & {
    id: string;
};
