'use client';

import { FileText, ExternalLink, Star, Trash2, Link2, StickyNote, FolderClosed } from 'lucide-react';
import { KnowledgeItem } from '../actions';
import { cn } from '@/lib/utils';

interface ResourceCardProps {
    item: KnowledgeItem;
    onToggleStar?: () => void;
    onDelete?: () => void;
}

const typeIcons: Record<string, any> = {
    file: FileText,
    link: Link2,
    note: StickyNote,
};

const typeColors: Record<string, { icon: string; bg: string }> = {
    file: { icon: 'text-blue-600', bg: 'bg-blue-50' },
    link: { icon: 'text-emerald-600', bg: 'bg-emerald-50' },
    note: { icon: 'text-amber-600', bg: 'bg-amber-50' },
};

export function ResourceCard({ item, onToggleStar, onDelete }: ResourceCardProps) {
    const resourceType = item.resource_type || 'file';
    const TypeIcon = typeIcons[resourceType] || FileText;
    const colors = typeColors[resourceType] || typeColors.file;

    return (
        <div className="group bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-indigo-200 transition-all relative">
            {/* Top row: icon + actions */}
            <div className="flex justify-between items-start mb-3">
                <div className={cn("p-2.5 rounded-xl", colors.bg)}>
                    <TypeIcon size={22} className={colors.icon} />
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleStar?.(); }}
                        className={cn(
                            "p-1.5 rounded-lg transition-all",
                            item.is_starred
                                ? "text-amber-400 hover:text-amber-500"
                                : "text-slate-300 hover:text-amber-400 opacity-0 group-hover:opacity-100"
                        )}
                    >
                        <Star size={15} className={item.is_starred ? 'fill-amber-400' : ''} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                        className="p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 rounded-lg transition-all"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Title */}
            <h3 className="font-semibold text-slate-900 line-clamp-2 mb-2 text-sm leading-snug min-h-[2.5rem]">
                {item.title}
            </h3>

            {/* Meta: folder + tags */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded-full border border-slate-200">
                    <FolderClosed size={10} />
                    {item.category || 'General'}
                </span>
                {item.tags?.slice(0, 1).map(tag => (
                    <span key={tag} className="inline-block px-2 py-0.5 bg-slate-50 text-slate-500 text-[10px] rounded-full border border-slate-100">
                        {tag}
                    </span>
                ))}
            </div>

            {/* Open link button */}
            {item.url ? (
                <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 rounded-lg transition-colors"
                >
                    Open Resource <ExternalLink size={12} />
                </a>
            ) : (
                <div className="py-2 text-xs text-center text-slate-400">No link available</div>
            )}
        </div>
    );
}
