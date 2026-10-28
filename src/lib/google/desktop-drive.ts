import { createClient } from '@/lib/supabase/client';

// A normal browser on localhost is not Tauri.
export const hasNativeDrive = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function desktopDriveIdentity(groupId?: string) {
    const group = groupId || window.location.pathname.split('/')[1];
    if (!/^[0-9a-f-]{36}$/i.test(group || '')) throw new Error('Select a group before connecting Google');
    const { data, error } = await createClient().auth.getUser();
    if (error || !data.user) throw new Error('Sign in to PhD Nexus before connecting Google');
    return { userId: data.user.id, groupId: group };
}

export async function desktopDriveCommand<T>(command: string, groupId?: string, extra = {}, expectedUserId?: string): Promise<T> {
    const identity = await desktopDriveIdentity(groupId);
    if (expectedUserId && identity.userId !== expectedUserId) throw new Error('Session changed. Retry from the original account.');
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, { ...identity, ...extra });
}

export async function ramanDriveToken(groupId?: string, force = false, expectedUserId?: string): Promise<string> {
    if (hasNativeDrive()) return desktopDriveCommand<string>('google_drive_token', groupId, { force }, expectedUserId);
    const { ensureAuth } = await import('./auth');
    return ensureAuth(['https://www.googleapis.com/auth/drive.file']);
}

// Retry only an explicit 401. Network failures of a write must be reconciled by ID.
export async function ramanDriveFetch(url: string, options: RequestInit = {}, groupId?: string, expectedUserId?: string) {
    const send = (token: string) => fetch(url, { ...options,
        headers: { ...Object.fromEntries(new Headers(options.headers).entries()), Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000) });
    let response = await send(await ramanDriveToken(groupId, false, expectedUserId));
    if (response.status === 401 && hasNativeDrive()) response = await send(await ramanDriveToken(groupId, true, expectedUserId));
    return response;
}
