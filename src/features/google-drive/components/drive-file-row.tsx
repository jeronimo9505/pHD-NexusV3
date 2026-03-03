'use client';

import { DriveFile } from './drive-browser';
import { getFileIcon, formatFileSize, formatDate } from './drive-utils';
import { Info } from 'lucide-react';

interface DriveFileRowProps {
    file: DriveFile;
    onClick: () => void;
    onInfoClick?: () => void;
}

export function DriveFileRow({ file, onClick, onInfoClick }: DriveFileRowProps) {
    const { icon: Icon, color, bgColor } = getFileIcon(file.mimeType);
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

    return (
        <div
            onClick={onClick}
            className="grid grid-cols-[1fr_140px_120px_100px_32px] gap-4 px-4 py-2.5 border-b border-slate-50 hover:bg-blue-50/40 transition-colors cursor-pointer group items-center"
        >
            {/* Name */}
            <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bgColor}`}>
                    <Icon size={18} className={color} />
                </div>
                <span className={`text-sm truncate ${isFolder ? 'font-medium text-slate-800' : 'text-slate-700'} group-hover:text-blue-700 transition-colors`}>
                    {file.name}
                </span>
            </div>

            {/* Modified by */}
            <span className="text-xs text-slate-500 truncate">
                {file.lastModifyingUser?.displayName || '—'}
            </span>

            {/* Modified */}
            <span className="text-xs text-slate-400">
                {file.modifiedTime ? formatDate(file.modifiedTime) : '—'}
            </span>

            {/* Size */}
            <span className="text-xs text-slate-400 text-right">
                {isFolder ? '—' : formatFileSize(file.size)}
            </span>

            {/* Info button */}
            {!isFolder && onInfoClick ? (
                <button
                    onClick={(e) => { e.stopPropagation(); onInfoClick(); }}
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-50 group-hover:opacity-100 transition-all"
                    title="File details"
                >
                    <Info size={15} />
                </button>
            ) : (
                <div />
            )}
        </div>
    );
}
