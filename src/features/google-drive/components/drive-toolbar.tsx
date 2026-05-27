'use client';

import { Search, List, LayoutGrid, RefreshCw, ChevronDown, Activity, Upload, FolderPlus, Plus, FileText, Sheet, Presentation } from 'lucide-react';
import { ViewMode, SortBy } from './drive-browser';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export type GoogleFileType = 'document' | 'spreadsheet' | 'presentation';

interface DriveToolbarProps {
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    sortBy: SortBy;
    onSortChange: (sort: SortBy) => void;
    onRefresh: () => void;
    isLoading: boolean;
    onActivityToggle: () => void;
    isActivityOpen: boolean;
    onUploadFiles: (files: FileList) => void;
    onCreateFolder: () => void;
    onCreateGoogleFile: (type: GoogleFileType) => void;
    isUploading?: boolean;
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
    { value: 'modified_desc', label: 'Last Modified (Newest)' },
    { value: 'modified_asc', label: 'Last Modified (Oldest)' },
    { value: 'name_asc', label: 'Name (A → Z)' },
    { value: 'name_desc', label: 'Name (Z → A)' },
];

export function DriveToolbar({
    viewMode,
    onViewModeChange,
    searchQuery,
    onSearchChange,
    sortBy,
    onSortChange,
    onRefresh,
    isLoading,
    onActivityToggle,
    isActivityOpen,
    onUploadFiles,
    onCreateFolder,
    onCreateGoogleFile,
    isUploading
}: DriveToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [showNewMenu, setShowNewMenu] = useState(false);
    const sortRef = useRef<HTMLDivElement>(null);
    const newRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
                setShowSortMenu(false);
            }
            if (newRef.current && !newRef.current.contains(e.target as Node)) {
                setShowNewMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Sort';

    return (
        <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                    type="text"
                    placeholder="Search files and folders..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
                />
            </div>

            <div className="flex-1" />

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files?.length) { onUploadFiles(e.target.files); e.target.value = ''; } }}
            />

            {/* + New dropdown */}
            <div className="relative" ref={newRef}>
                <button
                    onClick={() => setShowNewMenu(!showNewMenu)}
                    disabled={isUploading}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                >
                    <Plus size={18} />
                    <span>{isUploading ? 'Uploading...' : 'New'}</span>
                    <ChevronDown size={14} className={cn('transition-transform ml-0.5', showNewMenu && 'rotate-180')} />
                </button>

                {showNewMenu && (
                    <div className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1.5 animate-in fade-in zoom-in-95 duration-100">
                        {/* Folder */}
                        <button
                            onClick={() => { onCreateFolder(); setShowNewMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <FolderPlus size={18} className="text-slate-500" />
                            New Folder
                        </button>

                        <div className="border-t border-slate-100 my-1" />

                        {/* Upload */}
                        <button
                            onClick={() => { fileInputRef.current?.click(); setShowNewMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <Upload size={18} className="text-slate-500" />
                            Upload File
                        </button>

                        <div className="border-t border-slate-100 my-1" />

                        {/* Google Docs */}
                        <button
                            onClick={() => { onCreateGoogleFile('document'); setShowNewMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <FileText size={18} className="text-blue-600" />
                            Google Docs
                        </button>

                        {/* Google Sheets */}
                        <button
                            onClick={() => { onCreateGoogleFile('spreadsheet'); setShowNewMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <Sheet size={18} className="text-green-600" />
                            Google Sheets
                        </button>

                        {/* Google Slides */}
                        <button
                            onClick={() => { onCreateGoogleFile('presentation'); setShowNewMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <Presentation size={18} className="text-amber-500" />
                            Google Slides
                        </button>
                    </div>
                )}
            </div>

            {/* Refresh */}
            <button
                onClick={onRefresh}
                disabled={isLoading}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
            >
                <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            </button>

            {/* Activity Feed */}
            <button
                onClick={onActivityToggle}
                className={cn(
                    'p-2 rounded-lg transition-colors',
                    isActivityOpen
                        ? 'bg-indigo-100 text-indigo-600'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                )}
                title="Activity Feed"
            >
                <Activity size={18} />
            </button>

            {/* Sort Dropdown */}
            <div className="relative" ref={sortRef}>
                <button
                    onClick={() => setShowSortMenu(!showSortMenu)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                >
                    <span className="hidden sm:inline">{currentSortLabel}</span>
                    <span className="sm:hidden">Sort</span>
                    <ChevronDown size={14} className={cn('transition-transform', showSortMenu && 'rotate-180')} />
                </button>

                {showSortMenu && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-xl border border-slate-200 z-50 py-1 animate-in fade-in zoom-in-95 duration-100">
                        {SORT_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => { onSortChange(opt.value); setShowSortMenu(false); }}
                                className={cn(
                                    'w-full text-left px-3 py-2 text-sm transition-colors',
                                    sortBy === opt.value
                                        ? 'bg-blue-50 text-blue-700 font-medium'
                                        : 'text-slate-600 hover:bg-slate-50'
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* View Toggle */}
            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                <button
                    onClick={() => onViewModeChange('list')}
                    className={cn(
                        'p-2 transition-colors',
                        viewMode === 'list'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-slate-500 hover:bg-slate-50'
                    )}
                    title="List view"
                >
                    <List size={16} />
                </button>
                <button
                    onClick={() => onViewModeChange('grid')}
                    className={cn(
                        'p-2 transition-colors',
                        viewMode === 'grid'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-slate-500 hover:bg-slate-50'
                    )}
                    title="Grid view"
                >
                    <LayoutGrid size={16} />
                </button>
            </div>
        </div>
    );
}
