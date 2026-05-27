'use client';

import { KnowledgeItem } from '../actions';
import { Star, ExternalLink, Trash2, FileText, Link2, StickyNote, FolderClosed } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResourceRowProps {
    item: KnowledgeItem;
    onToggleStar: () => void;
    onDelete: () => void;
}

const typeIcons: Record<string, any> = {
    file: FileText,
    link: Link2,
    note: StickyNote,
};

const typeColors: Record<string, string> = {
    file: 'text-blue-600 bg-blue-50',
    link: 'text-emerald-600 bg-emerald-50',
    note: 'text-amber-600 bg-amber-50',
};

function formatDate(dateStr?: string) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ResourceRow({ item, onToggleStar, onDelete }: ResourceRowProps) {
    const resourceType = item.resource_type || 'file';
    const TypeIcon = typeIcons[resourceType] || FileText;
    const colorClass = typeColors[resourceType] || typeColors.file;

    return (
        <div className="grid grid-cols-[1fr_150px_120px_80px_60px] gap-4 px-4 py-2.5 border-b border-slate-50 hover:bg-blue-50/30 transition-colors group items-center">
            {/* Name + open link */}
            <div className="flex items-center gap-3 min-w-0">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", colorClass)}>
                    <TypeIcon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                    {item.url ? (
                        <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-slate-800 hover:text-indigo-600 truncate block font-medium transition-colors"
                        >
                            {item.title}
                        </a>
                    ) : (
                        <span className="text-sm text-slate-800 truncate block font-medium">{item.title}</span>
                    )}
                </div>
                {item.url && (
                    <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                    >
                        <ExternalLink size={14} />
                    </a>
                )}
            </div>

            {/* Folder/Category */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
                <FolderClosed size={12} className="flex-shrink-0" />
                <span className="truncate">{item.category || 'General'}</span>
            </div>

            {/* Date */}
            <span className="text-xs text-slate-400">{formatDate(item.created_at)}</span>

            {/* Type badge */}
            <span className={cn("text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full text-center", colorClass)}>
                {resourceType}
            </span>

            {/* Star + Actions */}
            <div className="flex items-center justify-center gap-1">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
                    className={cn(
                        "p-1 rounded transition-colors",
                        item.is_starred
                            ? "text-amber-400 hover:text-amber-500"
                            : "text-slate-300 hover:text-amber-400 opacity-0 group-hover:opacity-100"
                    )}
                >
                    <Star size={14} className={item.is_starred ? 'fill-amber-400' : ''} />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 rounded transition-all"
                >
                    <Trash2 size={13} />
                </button>
            </div>
        </div>
    );
}
