'use client';

import { useState, useRef, useEffect } from 'react';
import { CreateReportModal } from './create-report-modal';
import { Plus, FileText, Presentation, StickyNote, ChevronDown, Link2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReportType } from '../types';
import { DriveFileSelectorModal } from './drive-file-selector-modal';
import { toast } from 'sonner';
import { createDriveReportAction } from '../actions';

export function CreateReportButton({
    groupId,
    driveSettings
}: {
    groupId: string;
    driveSettings?: { clientId?: string; apiKey?: string; folderId?: string };
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<ReportType>('report');
    const [isLinkingFile, setIsLinkingFile] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleCreateReport = (type: ReportType | 'link_existing') => {
        if (type === 'link_existing') {
            handleLinkExistingFile();
            setIsDropdownOpen(false);
            return;
        }
        setSelectedType(type as ReportType);
        setIsDropdownOpen(false);
        setIsOpen(true);
    };

    const handleLinkExistingFile = () => {
        if (!driveSettings?.clientId || !driveSettings?.apiKey) {
            toast.error('Please configure Google Drive settings first');
            return;
        }
        setIsLinkingFile(true);
    };

    const handleFileSelected = async (file: any) => {
        try {
            // Detect file type from mimeType
            let fileType: ReportType = 'report';
            if (file.mimeType?.includes('presentation') || file.mimeType?.includes('application/vnd.google-apps.presentation')) {
                fileType = 'ppt';
            } else if (file.name?.toLowerCase().includes('meeting') || file.name?.toLowerCase().includes('minuta')) {
                fileType = 'meeting_note';
            }

            // Create report with file metadata
            const formData = new FormData();
            formData.append('title', file.name || 'Untitled');
            formData.append('group_id', groupId);
            formData.append('type', fileType);
            formData.append('web_view_link', file.webViewLink || '');
            formData.append('drive_file_id', file.id || '');
            formData.append('status', 'generated'); // File already exists
            formData.append('sections', JSON.stringify({})); // Empty sections for linked files

            const result = await createDriveReportAction(formData);
            if (result?.error) {
                throw new Error(result.error);
            }

            toast.success('File linked successfully!');
        } catch (error: any) {
            console.error('Error linking file:', error);
            toast.error(error.message || 'Failed to link file');
        } finally {
            setIsLinkingFile(false);
        }
    };

    const reportTypes = [
        {
            type: 'report' as ReportType,
            label: 'Scientific Report',
            description: 'Monthly or by period',
            icon: FileText,
            color: 'text-indigo-600',
            bgColor: 'bg-indigo-50',
            hoverBg: 'hover:bg-indigo-100'
        },
        {
            type: 'meeting_note' as ReportType,
            label: 'Meeting Note',
            description: 'Minutes or quick notes',
            icon: StickyNote,
            color: 'text-emerald-600',
            bgColor: 'bg-emerald-50',
            hoverBg: 'hover:bg-emerald-100'
        },
        {
            type: 'ppt' as ReportType,
            label: 'PPT Presentation',
            description: 'Upload .pptx file',
            icon: Presentation,
            color: 'text-orange-600',
            bgColor: 'bg-orange-50',
            hoverBg: 'hover:bg-orange-100'
        },
        {
            type: 'link_existing' as any,
            label: 'Link Existing File',
            description: 'From Google Drive',
            icon: Link2,
            color: 'text-blue-600',
            bgColor: 'bg-blue-50',
            hoverBg: 'hover:bg-blue-100'
        }
    ];

    return (
        <>
            <div className="relative" ref={dropdownRef}>
                <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition shadow-sm hover:shadow font-medium"
                >
                    <Plus size={18} />
                    <span>New</span>
                    <ChevronDown className={cn(
                        "w-4 h-4 transition-transform",
                        isDropdownOpen && "rotate-180"
                    )} />
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2">
                            {reportTypes.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.type}
                                        onClick={() => handleCreateReport(item.type)}
                                        disabled={isLinkingFile && item.type === 'link_existing'}
                                        className={cn(
                                            "w-full flex items-start gap-3 p-3 rounded-lg transition-all text-left",
                                            "hover:shadow-sm border border-transparent hover:border-slate-200",
                                            "disabled:opacity-50 disabled:cursor-not-allowed",
                                            item.hoverBg
                                        )}
                                    >
                                        <div className={cn(
                                            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                                            item.bgColor
                                        )}>
                                            {isLinkingFile && item.type === 'link_existing' ? (
                                                <Loader2 className={cn("w-5 h-5 animate-spin", item.color)} />
                                            ) : (
                                                <Icon className={cn("w-5 h-5", item.color)} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-sm text-slate-800">
                                                {item.label}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                                {isLinkingFile && item.type === 'link_existing' ? 'Opening picker...' : item.description}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <CreateReportModal
                groupId={groupId}
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                driveSettings={driveSettings}
                initialType={selectedType}
            />

            <DriveFileSelectorModal
                isOpen={isLinkingFile}
                onClose={() => setIsLinkingFile(false)}
                onSelect={handleFileSelected}
                driveSettings={driveSettings}
            />
        </>
    );
}
