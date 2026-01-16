export function safeDate(value) {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
}

export function formatShortDate(value) {
    const d = safeDate(value);
    return d ? d.toLocaleDateString() : '—';
}

export function formatMonthDay(value) {
    const d = safeDate(value);
    return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
}

export function normalizeComment(raw) {
    const createdAt = raw?.created_at || raw?.date || raw?.createdAt;
    return {
        ...raw,
        author: raw?.author || 'Unknown',
        created_at: createdAt,
        text: raw?.text ?? raw?.content ?? ''
    };
}
