import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Consistent date formatting to avoid hydration mismatches.
 * Formato: DD/MM/YYYY
 */
export function formatDate(date: string | Date | null | undefined): string {
    if (!date) return '-';
    try {
        const d = new Date(date);
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
    } catch {
        return '-';
    }
}

export function formatMonthShort(date: string | Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[new Date(date).getUTCMonth()];
}

export function formatDayNumeric(date: string | Date): string {
    return String(new Date(date).getUTCDate());
}

export function formatDayLong(date: string | Date): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date(date).getUTCDay()];
}

export function formatTimeShort(date: string | Date): string {
    const d = new Date(date);
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}
