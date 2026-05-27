'use server';

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const profileSchema = z.object({
    full_name: z.string().min(2),
    avatar_url: z.string().url().optional().or(z.literal('')),
});

export async function updateProfileAction(formData: FormData) {
    const supabase = await createClient();

    const rawData = {
        full_name: formData.get('full_name'),
        avatar_url: formData.get('avatar_url'),
    };

    const validation = profileSchema.safeParse(rawData);
    if (!validation.success) return { error: 'Validation failed' };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { error } = await supabase.from('profiles').update({
        full_name: validation.data.full_name,
        avatar_url: validation.data.avatar_url || null,
    }).eq('id', user.id);

    if (error) return { error: error.message };

    revalidatePath('/profile');
    return { success: true };
}
