'use client';

import { useState, useMemo } from 'react';
import { KnowledgeItem } from '../actions';
import { toggleStarAction, deleteKnowledgeItemAction } from '../actions';
import { ResourceCard } from './resource-card';
import { ResourceRow } from './resource-row';
import { CreateResourceDialog } from './create-resource-dialog';
import { SyncDriveButton } from './sync-drive-button';
import {
    Search, LayoutGrid, List, Plus, Star, FolderClosed, Library,
    ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface KnowledgeExplorerProps {
    initialItems: KnowledgeItem[];
    groupId: string;
    driveSettings?: any;
}

type ViewMode = 'grid' | 'list';

export function KnowledgeExplorer({ initialItems, groupId, driveSettings }: KnowledgeExplorerProps) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [activeFolder, setActiveFolder] = useState('all');
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [showCreateDialog, setShowCreateDialog] = useState(false);

    // Derive folders from items
    const folders = useMemo(() => {
        const folderSet = new Set(initialItems.map(i => i.category).filter(Boolean));
        return Array.from(folderSet).sort() as string[];
    }, [initialItems]);

    // Filter & sort items
    const filteredItems = useMemo(() => {
        let items = [...initialItems];

        // Folder filter
        if (activeFolder === 'starred') {
            items = items.filter(i => i.is_starred);
        } else if (activeFolder !== 'all') {
            items = items.filter(i => i.category === activeFolder);
        }

        // Search filter
        if (search.trim()) {
            const q = search.toLowerCase();
            items = items.filter(i =>
                i.title.toLowerCase().includes(q) ||
                i.category?.toLowerCase().includes(q) ||
                i.tags?.some(t => t.toLowerCase().includes(q))
            );
        }

        // Sort: starred first, then pinned, then by date
        items.sort((a, b) => {
            if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
            if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
            return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        });

        return items;
    }, [initialItems, activeFolder, search]);

    const starredCount = initialItems.filter(i => i.is_starred).length;

    const handleToggleStar = async (id: string, currentStatus: boolean) => {
        const result = await toggleStarAction(id, currentStatus, groupId);
        if (result.error) toast.error(result.error);
        else router.refresh();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this resource?')) return;
        const result = await deleteKnowledgeItemAction(id, groupId);
        if (result.error) toast.error(result.error);
        else {
            toast.success('Resource deleted');
            router.refresh();
        }
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <header className="flex justify-between items-center px-8 pt-8 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Library className="text-indigo-600" /> Knowledge Base
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        {initialItems.length} resources · {folders.length} folders
                    </p>
                </div>
                <div className="flex gap-2">
                    <SyncDriveButton groupId={groupId} driveSettings={driveSettings} />
                    <button
                        onClick={() => setShowCreateDialog(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                    >
                        <Plus size={16} /> New Resource
                    </button>
                </div>
            </header>

            {/* Main area with sidebar */}
            <div className="flex-1 flex overflow-hidden">
                {/* Folder sidebar */}
                <aside className="w-56 flex-shrink-0 border-r border-slate-200 bg-slate-50/50 overflow-y-auto px-3 py-4 space-y-1">
                    <button
                        onClick={() => setActiveFolder('all')}
                        className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                            activeFolder === 'all'
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                : "text-slate-600 hover:bg-white hover:text-slate-900"
                        )}
                    >
                        <Library size={16} />
                        <span className="flex-1 text-left">All Resources</span>
                        <span className="text-xs text-slate-400">{initialItems.length}</span>
                    </button>

                    <button
                        onClick={() => setActiveFolder('starred')}
                        className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                            activeFolder === 'starred'
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "text-slate-600 hover:bg-white hover:text-slate-900"
                        )}
                    >
                        <Star size={16} className={activeFolder === 'starred' ? 'fill-amber-400' : ''} />
                        <span className="flex-1 text-left">Starred</span>
                        {starredCount > 0 && <span className="text-xs text-amber-500">{starredCount}</span>}
                    </button>

                    <div className="pt-3 pb-1 px-3">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Folders</p>
                    </div>

                    {folders.map(folder => {
                        const count = initialItems.filter(i => i.category === folder).length;
                        return (
                            <button
                                key={folder}
                                onClick={() => setActiveFolder(folder)}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                                    activeFolder === folder
                                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium"
                                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                                )}
                            >
                                <FolderClosed size={15} className="flex-shrink-0" />
                                <span className="flex-1 text-left truncate">{folder}</span>
                                <span className="text-xs text-slate-400">{count}</span>
                            </button>
                        );
                    })}
                </aside>

                {/* Content area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Toolbar */}
                    <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white">
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-1 text-sm text-slate-500">
                            <span
                                className="hover:text-indigo-600 cursor-pointer"
                                onClick={() => setActiveFolder('all')}
                            >
                                All
                            </span>
                            {activeFolder !== 'all' && (
                                <>
                                    <ChevronRight size={14} />
                                    <span className="font-medium text-slate-800 capitalize">
                                        {activeFolder === 'starred' ? '⭐ Starred' : activeFolder}
                                    </span>
                                </>
                            )}
                        </div>

                        <div className="flex-1" />

                        {/* Search */}
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="text"
                                placeholder="Search resources..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 bg-slate-50"
                            />
                        </div>

                        {/* View toggle */}
                        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                            <button
                                onClick={() => setViewMode('list')}
                                className={cn(
                                    "p-1.5 rounded-md transition-colors",
                                    viewMode === 'list' ? "bg-white shadow-sm text-indigo-600" : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                <List size={16} />
                            </button>
                            <button
                                onClick={() => setViewMode('grid')}
                                className={cn(
                                    "p-1.5 rounded-md transition-colors",
                                    viewMode === 'grid' ? "bg-white shadow-sm text-indigo-600" : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                <LayoutGrid size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {filteredItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                <Library size={40} className="mb-3 opacity-50" />
                                <p className="text-sm font-medium">No resources found</p>
                                <p className="text-xs mt-1">
                                    {search ? 'Try a different search term' : 'Sync from Drive or create a new resource'}
                                </p>
                            </div>
                        ) : viewMode === 'list' ? (
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                {/* List header */}
                                <div className="grid grid-cols-[1fr_150px_120px_80px_60px] gap-4 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <span>Name</span>
                                    <span>Folder</span>
                                    <span>Added</span>
                                    <span>Type</span>
                                    <span className="text-center">⭐</span>
                                </div>
                                {filteredItems.map(item => (
                                    <ResourceRow
                                        key={item.id}
                                        item={item}
                                        onToggleStar={() => handleToggleStar(item.id!, !!item.is_starred)}
                                        onDelete={() => handleDelete(item.id!)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {filteredItems.map(item => (
                                    <ResourceCard
                                        key={item.id}
                                        item={item}
                                        onToggleStar={() => handleToggleStar(item.id!, !!item.is_starred)}
                                        onDelete={() => handleDelete(item.id!)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Create Dialog */}
            {showCreateDialog && (
                <CreateResourceDialog
                    groupId={groupId}
                    folders={folders}
                    onClose={() => setShowCreateDialog(false)}
                />
            )}
        </div>
    );
}
