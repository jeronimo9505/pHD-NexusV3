'use client';

import { ChevronRight, Home } from 'lucide-react';

interface FolderEntry {
    id: string;
    name: string;
}

interface DriveBreadcrumbsProps {
    path: FolderEntry[];
    onNavigate: (index: number) => void;
}

export function DriveBreadcrumbs({ path, onNavigate }: DriveBreadcrumbsProps) {
    return (
        <div className="px-6 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-1 text-sm overflow-x-auto">
            {path.map((entry, index) => {
                const isLast = index === path.length - 1;
                return (
                    <span key={`${entry.id}-${index}`} className="flex items-center gap-1 shrink-0">
                        {index > 0 && (
                            <ChevronRight size={14} className="text-slate-300 mx-0.5" />
                        )}
                        <button
                            onClick={() => onNavigate(index)}
                            className={`px-1.5 py-0.5 rounded transition-colors inline-flex items-center gap-1 ${isLast
                                    ? 'font-semibold text-slate-800 cursor-default'
                                    : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                                }`}
                            disabled={isLast}
                        >
                            {index === 0 && <Home size={13} className="shrink-0" />}
                            <span className="truncate max-w-[180px]">{entry.name}</span>
                        </button>
                    </span>
                );
            })}
        </div>
    );
}
