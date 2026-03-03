'use client';

import { useState, useEffect } from 'react';
import { X, Activity, Loader2, Edit, Eye, Share2, Trash2, MessageSquare, Plus, Folder, ExternalLink } from 'lucide-react';
import { formatDate } from './drive-utils';
import { cn } from '@/lib/utils';

interface ActivityItem {
    time: string;
    action: string;
    fileName: string;
    userName: string;
    type: 'edit' | 'create' | 'view' | 'share' | 'delete' | 'comment' | 'move';
    webViewLink?: string;
    mimeType?: string;
}

interface ActivityFeedPanelProps {
    isOpen: boolean;
    onClose: () => void;
    rootFolderId: string;
}

const ACTION_ICONS: Record<string, { icon: typeof Edit; color: string; bgColor: string }> = {
    edit: { icon: Edit, color: 'text-blue-600', bgColor: 'bg-blue-50' },
    create: { icon: Plus, color: 'text-green-600', bgColor: 'bg-green-50' },
    view: { icon: Eye, color: 'text-slate-500', bgColor: 'bg-slate-100' },
    share: { icon: Share2, color: 'text-purple-600', bgColor: 'bg-purple-50' },
    delete: { icon: Trash2, color: 'text-red-600', bgColor: 'bg-red-50' },
    comment: { icon: MessageSquare, color: 'text-amber-600', bgColor: 'bg-amber-50' },
    move: { icon: Folder, color: 'text-orange-600', bgColor: 'bg-orange-50' },
};

export function ActivityFeedPanel({ isOpen, onClose, rootFolderId }: ActivityFeedPanelProps) {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadRecentActivity();
        }
    }, [isOpen]);

    const loadRecentActivity = async () => {
        setLoading(true);
        setError(null);

        try {
            const gapi = (window as any).gapi;
            if (!gapi?.client?.drive) {
                throw new Error('Drive API not loaded');
            }

            // Step 1: Recursively collect all folder IDs under rootFolderId
            const allFolderIds: string[] = [rootFolderId];
            const foldersToScan = [rootFolderId];

            while (foldersToScan.length > 0) {
                const batch = foldersToScan.splice(0, 5);
                const results = await Promise.all(
                    batch.map(fId =>
                        gapi.client.drive.files.list({
                            q: `'${fId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                            fields: 'files(id)',
                            pageSize: 100
                        })
                    )
                );
                for (const res of results) {
                    const subFolders = res.result.files || [];
                    for (const sf of subFolders) {
                        allFolderIds.push(sf.id);
                        foldersToScan.push(sf.id);
                    }
                }
            }

            // Step 2: Query recently modified files scoped to those folders
            const sevenDaysAgo = getDateNDaysAgo(7);
            const BATCH_SIZE = 20;
            const allFiles: any[] = [];

            for (let i = 0; i < allFolderIds.length; i += BATCH_SIZE) {
                const chunk = allFolderIds.slice(i, i + BATCH_SIZE);
                const parentFilter = chunk.map(id => `'${id}' in parents`).join(' or ');

                const response = await gapi.client.drive.files.list({
                    q: `(${parentFilter}) and trashed=false and modifiedTime > '${sevenDaysAgo}'`,
                    fields: 'files(id, name, mimeType, modifiedTime, lastModifyingUser, createdTime, webViewLink)',
                    orderBy: 'modifiedTime desc',
                    pageSize: 50
                });

                allFiles.push(...(response.result.files || []));
            }

            // Deduplicate by ID and sort by time
            const uniqueMap = new Map<string, any>();
            for (const f of allFiles) {
                if (!uniqueMap.has(f.id)) uniqueMap.set(f.id, f);
            }
            const uniqueFiles = Array.from(uniqueMap.values())
                .sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime())
                .slice(0, 50);

            // Build activity items
            const items: ActivityItem[] = uniqueFiles.map((f: any) => {
                const createdAt = new Date(f.createdTime);
                const modifiedAt = new Date(f.modifiedTime);
                const diffMs = modifiedAt.getTime() - createdAt.getTime();
                const isNew = diffMs < 60000;

                return {
                    time: f.modifiedTime,
                    action: isNew ? 'Created' : 'Modified',
                    fileName: f.name,
                    userName: f.lastModifyingUser?.displayName || 'Someone',
                    type: isNew ? 'create' as const : 'edit' as const,
                    webViewLink: f.webViewLink,
                    mimeType: f.mimeType,
                };
            });

            setActivities(items);
        } catch (err: any) {
            console.error('Error loading activity:', err);
            setError('Could not load recent activity.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="w-[380px] border-l border-slate-200 bg-white flex flex-col h-full shrink-0 animate-in slide-in-from-right-4 duration-200">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                    <Activity size={16} className="text-indigo-600" />
                    Recent Activity
                </h3>
                <button
                    onClick={onClose}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Subtitle */}
            <div className="px-5 py-2 border-b border-slate-50">
                <p className="text-[11px] text-slate-400">Changes from the last 7 days in your group folder</p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                        <Loader2 size={24} className="text-blue-500 animate-spin" />
                        <p className="text-xs text-slate-400">Scanning folders...</p>
                    </div>
                ) : error ? (
                    <div className="px-5 py-8 text-center">
                        <p className="text-sm text-slate-400">{error}</p>
                    </div>
                ) : activities.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                        <Activity size={32} className="text-slate-200 mx-auto mb-3" />
                        <p className="text-sm text-slate-400">No recent activity</p>
                    </div>
                ) : (
                    <div className="px-4 py-2">
                        {activities.map((activity, index) => {
                            const actionInfo = ACTION_ICONS[activity.type] || ACTION_ICONS.edit;
                            const ActionIcon = actionInfo.icon;

                            return (
                                <div
                                    key={`${activity.fileName}-${index}`}
                                    className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0 group"
                                >
                                    <div className={cn(
                                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                                        actionInfo.bgColor
                                    )}>
                                        <ActionIcon size={14} className={actionInfo.color} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-slate-700 leading-relaxed">
                                            <span className="font-medium">{activity.userName}</span>
                                            {' '}{activity.action.toLowerCase()}{' '}
                                            {activity.webViewLink ? (
                                                <a
                                                    href={activity.webViewLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-medium text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-0.5"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {activity.fileName}
                                                    <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </a>
                                            ) : (
                                                <span className="font-medium text-slate-800">{activity.fileName}</span>
                                            )}
                                        </p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                            {formatDate(activity.time)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function getDateNDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
}
