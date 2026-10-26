type VisitResult = { success?: boolean; error?: string };

export function createVisitTracker(send: (groupId: string) => Promise<VisitResult>, now = Date.now) {
    const pending = new Map<string, Promise<void>>();
    const completed = new Map<string, number>();
    return async (userId: string, groupId: string) => {
        const key = `${userId}:${groupId}`;
        const until = completed.get(key);
        if (until !== undefined && until > now()) return;
        const existing = pending.get(key);
        if (existing) return existing;
        const request = Promise.resolve().then(() => send(groupId)).then(result => {
            if (result.error || !result.success) throw new Error(result.error || 'Visit was not recorded');
            if (completed.size >= 100) completed.delete(completed.keys().next().value!);
            completed.set(key, now() + 4 * 60 * 60 * 1000);
        }).finally(() => pending.delete(key));
        pending.set(key, request);
        return request;
    };
}
