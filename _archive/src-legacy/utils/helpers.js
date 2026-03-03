export const getDaysSince = (dateString) => {
    if (!dateString) return 0;
    const created = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - created);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
};

export const formatDateShort = (dateString) => {
    if (!dateString) return '';
    return safeDate(dateString).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

export const formatDateLong = (dateString) => {
    if (!dateString) return '';
    return safeDate(dateString).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};

// Helper to avoid timezone shifts
const safeDate = (str) => {
    if (!str) return null;
    // If it looks like an ISO string (has time) or isn't YYYY-MM-DD, use standard Date
    if (str.includes('T') || str.length > 10) {
        return new Date(str);
    }
    // Handle YYYY-MM-DD to avoid timezone shifts
    if (str.includes('-')) {
        const [y, m, d] = str.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(str);
};

export const getWeekLabel = (start, end) => {
    if (!start && !end) return 'Sin fechas';

    // Use safeDate to prevent timezone shifts (e.g. 2026-01-05 -> Jan 4)
    const formatDate = (d) => {
        if (!d) return '...';
        return safeDate(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    };

    return `${formatDate(start)} - ${formatDate(end)}`;
};

export const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

export const getMonthLabel = (dateString) => {
    if (!dateString) return 'Sin fecha';
    const date = new Date(dateString);
    const label = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
};
