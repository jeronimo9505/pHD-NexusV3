'use client';

import { useState, useEffect, useCallback } from 'react';
import { DriveFile } from './drive-browser';
import { getFileIcon, formatDate, formatFileSize } from './drive-utils';
import { X, Download, Clock, User, ExternalLink, Loader2, FileText, History } from 'lucide-react';

interface Revision {
    id: string;
    modifiedTime: string;
    lastModifyingUser?: {
        displayName: string;
        photoLink?: string;
    };
    size?: string;
    exportLinks?: Record<string, string>;
}

interface FileDetailPanelProps {
    file: DriveFile | null;
    onClose: () => void;
}

export function FileDetailPanel({ file, onClose }: FileDetailPanelProps) {
    const [revisions, setRevisions] = useState<Revision[]>([]);
    const [loadingRevisions, setLoadingRevisions] = useState(false);
    const [revisionError, setRevisionError] = useState<string | null>(null);

    useEffect(() => {
        if (file && file.mimeType !== 'application/vnd.google-apps.folder') {
            loadRevisions(file.id);
        } else {
            setRevisions([]);
        }
    }, [file?.id]);

    const loadRevisions = async (fileId: string) => {
        setLoadingRevisions(true);
        setRevisionError(null);
        try {
            const gapi = (window as any).gapi;
            const response = await gapi.client.drive.revisions.list({
                fileId,
                fields: 'revisions(id, modifiedTime, lastModifyingUser, size, exportLinks)',
                pageSize: 20
            });
            setRevisions(response.result.revisions || []);
        } catch (err: any) {
            console.error('Error loading revisions:', err);
            // Some file types don't support revisions
            if (err?.status === 403 || err?.status === 404) {
                setRevisionError('Revision history not available for this file type.');
            } else {
                setRevisionError('Could not load revision history.');
            }
        } finally {
            setLoadingRevisions(false);
        }
    };

    const handleDownloadRevision = (fileId: string, revisionId: string) => {
        const gapi = (window as any).gapi;
        const token = gapi.client.getToken()?.access_token;
        if (!token) return;

        const url = `https://www.googleapis.com/drive/v3/files/${fileId}/revisions/${revisionId}?alt=media`;
        const a = document.createElement('a');
        a.href = url + `&access_token=${token}`;
        a.target = '_blank';
        a.click();
    };

    const handleDownloadFile = () => {
        if (!file) return;
        const gapi = (window as any).gapi;
        const token = gapi.client.getToken()?.access_token;
        if (!token) return;

        // For Google Docs types, use export
        const exportMimeMap: Record<string, { mime: string; ext: string }> = {
            'application/vnd.google-apps.document': { mime: 'application/pdf', ext: 'pdf' },
            'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
            'application/vnd.google-apps.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' },
        };

        const exportInfo = exportMimeMap[file.mimeType];
        let url: string;

        if (exportInfo) {
            url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportInfo.mime)}&access_token=${token}`;
        } else {
            url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&access_token=${token}`;
        }

        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.download = file.name;
        a.click();
    };

    if (!file) return null;

    const { icon: Icon, color, bgColor } = getFileIcon(file.mimeType);
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

    return (
        <div className="w-[380px] border-l border-slate-200 bg-white flex flex-col h-full shrink-0 animate-in slide-in-from-right-4 duration-200">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800 text-sm">File Details</h3>
                <button
                    onClick={onClose}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                >
                    <X size={18} />
                </button>
            </div>

            {/* File info */}
            <div className="p-5 border-b border-slate-100">
                <div className="flex items-start gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${bgColor}`}>
                        <Icon size={24} className={color} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-slate-800 text-sm leading-tight break-words">
                            {file.name}
                        </h4>
                        <p className="text-xs text-slate-400 mt-1">{file.mimeType.split('.').pop()?.replace('apps.', '') || 'File'}</p>
                    </div>
                </div>

                {/* Metadata */}
                <div className="mt-4 space-y-2.5">
                    {file.modifiedTime && (
                        <div className="flex items-center gap-2 text-xs">
                            <Clock size={13} className="text-slate-400 shrink-0" />
                            <span className="text-slate-500">Modified:</span>
                            <span className="text-slate-700 font-medium">{formatDate(file.modifiedTime)}</span>
                        </div>
                    )}
                    {file.lastModifyingUser && (
                        <div className="flex items-center gap-2 text-xs">
                            <User size={13} className="text-slate-400 shrink-0" />
                            <span className="text-slate-500">Modified by:</span>
                            <span className="text-slate-700 font-medium">{file.lastModifyingUser.displayName}</span>
                        </div>
                    )}
                    {file.owners?.[0] && (
                        <div className="flex items-center gap-2 text-xs">
                            <User size={13} className="text-slate-400 shrink-0" />
                            <span className="text-slate-500">Owner:</span>
                            <span className="text-slate-700 font-medium">{file.owners[0].displayName}</span>
                        </div>
                    )}
                    {!isFolder && file.size && (
                        <div className="flex items-center gap-2 text-xs">
                            <FileText size={13} className="text-slate-400 shrink-0" />
                            <span className="text-slate-500">Size:</span>
                            <span className="text-slate-700 font-medium">{formatFileSize(file.size)}</span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                    {file.webViewLink && (
                        <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                            <ExternalLink size={13} /> Open in Drive
                        </a>
                    )}
                    {!isFolder && (
                        <button
                            onClick={handleDownloadFile}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <Download size={13} /> Download
                        </button>
                    )}
                </div>
            </div>

            {/* Revision History */}
            {!isFolder && (
                <div className="flex-1 overflow-y-auto">
                    <div className="px-5 py-3 border-b border-slate-50">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <History size={12} /> Revision History
                        </h4>
                    </div>

                    {loadingRevisions ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 size={20} className="text-blue-500 animate-spin" />
                        </div>
                    ) : revisionError ? (
                        <div className="px-5 py-6 text-center">
                            <p className="text-xs text-slate-400">{revisionError}</p>
                        </div>
                    ) : revisions.length === 0 ? (
                        <div className="px-5 py-6 text-center">
                            <p className="text-xs text-slate-400">No revisions found</p>
                        </div>
                    ) : (
                        <div className="px-5 py-2 space-y-1">
                            {[...revisions].reverse().map((rev, index) => (
                                <div
                                    key={rev.id}
                                    className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0 group"
                                >
                                    {/* Timeline dot */}
                                    <div className="mt-1 shrink-0">
                                        <div className={`w-2 h-2 rounded-full ${index === 0 ? 'bg-blue-500' : 'bg-slate-300'}`} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-medium text-slate-700 truncate">
                                                {rev.lastModifyingUser?.displayName || 'Unknown user'}
                                            </span>
                                            <button
                                                onClick={() => handleDownloadRevision(file.id, rev.id)}
                                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-600 rounded transition-all"
                                                title="Download this version"
                                            >
                                                <Download size={12} />
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                            {formatDate(rev.modifiedTime)}
                                            {rev.size && ` · ${formatFileSize(rev.size)}`}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
