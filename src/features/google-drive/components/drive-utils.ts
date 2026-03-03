import {
    Folder,
    FileText,
    Sheet,
    Presentation,
    Image,
    File,
    FileSpreadsheet,
    Video,
    Music,
    FileCode,
    FileArchive,
    type LucideIcon
} from 'lucide-react';

interface FileIconInfo {
    icon: LucideIcon;
    color: string;
    bgColor: string;
}

export function getFileIcon(mimeType: string): FileIconInfo {
    // Folders
    if (mimeType === 'application/vnd.google-apps.folder') {
        return { icon: Folder, color: 'text-amber-600', bgColor: 'bg-amber-50' };
    }

    // Google Docs
    if (mimeType === 'application/vnd.google-apps.document') {
        return { icon: FileText, color: 'text-blue-600', bgColor: 'bg-blue-50' };
    }

    // Google Sheets
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        return { icon: FileSpreadsheet, color: 'text-emerald-600', bgColor: 'bg-emerald-50' };
    }

    // Google Slides
    if (mimeType === 'application/vnd.google-apps.presentation') {
        return { icon: Presentation, color: 'text-orange-600', bgColor: 'bg-orange-50' };
    }

    // PDF
    if (mimeType === 'application/pdf') {
        return { icon: FileText, color: 'text-red-600', bgColor: 'bg-red-50' };
    }

    // Images
    if (mimeType.startsWith('image/')) {
        return { icon: Image, color: 'text-purple-600', bgColor: 'bg-purple-50' };
    }

    // Video
    if (mimeType.startsWith('video/')) {
        return { icon: Video, color: 'text-pink-600', bgColor: 'bg-pink-50' };
    }

    // Audio
    if (mimeType.startsWith('audio/')) {
        return { icon: Music, color: 'text-violet-600', bgColor: 'bg-violet-50' };
    }

    // Spreadsheets (Excel, etc.)
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
        return { icon: FileSpreadsheet, color: 'text-emerald-600', bgColor: 'bg-emerald-50' };
    }

    // Presentations (PowerPoint, etc.)
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
        return { icon: Presentation, color: 'text-orange-600', bgColor: 'bg-orange-50' };
    }

    // Word docs
    if (mimeType.includes('word') || mimeType.includes('document')) {
        return { icon: FileText, color: 'text-blue-600', bgColor: 'bg-blue-50' };
    }

    // Code files
    if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html') || mimeType.includes('css') || mimeType.includes('python') || mimeType.includes('xml')) {
        return { icon: FileCode, color: 'text-cyan-600', bgColor: 'bg-cyan-50' };
    }

    // Archives
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('compressed')) {
        return { icon: FileArchive, color: 'text-yellow-700', bgColor: 'bg-yellow-50' };
    }

    // Default
    return { icon: File, color: 'text-slate-500', bgColor: 'bg-slate-100' };
}

export function formatFileSize(sizeStr?: string): string {
    if (!sizeStr) return '—';
    const bytes = parseInt(sizeStr, 10);
    if (isNaN(bytes)) return '—';

    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    } catch {
        return '—';
    }
}
