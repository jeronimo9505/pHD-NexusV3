'use client';

import { DriveFile } from './drive-browser';
import { getFileIcon, formatDate } from './drive-utils';
import { Info } from 'lucide-react';

interface DriveFileCardProps {
    file: DriveFile;
    onClick: () => void;
    onInfoClick?: () => void;
}

export function DriveFileCard({ file, onClick, onInfoClick }: DriveFileCardProps) {
    const { icon: Icon, color, bgColor } = getFileIcon(file.mimeType);
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

    return (
        <div
            onClick={onClick}
            className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group flex flex-col items-center text-center gap-3 relative"
        >
            {/* Info button (top-right, hover only) */}
            {!isFolder && onInfoClick && (
                <button
                    onClick={(e) => { e.stopPropagation(); onInfoClick(); }}
                    className="absolute top-2 right-2 p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                    title="File details"
                >
                    <Info size={14} />
                </button>
            )}

            {/* Icon */}
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bgColor} group-hover:scale-110 transition-transform`}>
                <Icon size={24} className={color} />
            </div>

            {/* Name */}
            <span className={`text-sm leading-tight line-clamp-2 w-full ${isFolder ? 'font-semibold text-slate-800' : 'text-slate-700'} group-hover:text-blue-700 transition-colors`}>
                {file.name}
            </span>

            {/* Date */}
            {file.modifiedTime && (
                <span className="text-[10px] text-slate-400">
                    {formatDate(file.modifiedTime)}
                </span>
            )}
        </div>
    );
}
