import { useState, useEffect, useRef } from 'react';
import { initGoogleClient } from '@/lib/google/auth';
import { uploadFileToDrive } from '@/lib/google/upload';
import { createDriveReportAction } from '../actions';
import { getTasksAction } from '@/features/tasks/actions'; // Import task action
import { toast } from 'sonner';
import { X, Loader2, FileText, CalendarDays, ChevronLeft, ChevronRight, Edit3, FileUp } from 'lucide-react';
import { ReportType } from '../types';
import { cn } from '@/lib/utils';
import { DraftEditorModal } from './draft-editor-modal';
import { createClient } from '@/lib/supabase/client';

interface CreateReportModalProps {
    groupId: string;
    isOpen: boolean;
    onClose: () => void;
    driveSettings?: {
        clientId?: string;
        apiKey?: string;
        folderId?: string;
        reportFolderId?: string;
        meetingFolderId?: string;
        pptFolderId?: string;
    };
    initialType?: ReportType;
}

// Helper to format date as YYYY-MM-DD
const formatLocalYMD = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export function CreateReportModal({ groupId, isOpen, onClose, driveSettings, initialType = 'report' }: CreateReportModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [type, setType] = useState<ReportType>(initialType);
    const [showDraftEditor, setShowDraftEditor] = useState(false);
    const [authorName, setAuthorName] = useState("User");

    // Date range state (only for reports)
    const [startDate, setStartDate] = useState(formatLocalYMD(new Date()));
    const [endDate, setEndDate] = useState(formatLocalYMD(new Date(Date.now() + 4 * 86400000))); // +4 days
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());
    const datePickerRef = useRef<HTMLDivElement>(null);

    // Form fields
    const [title, setTitle] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Fetch user on mount
    useEffect(() => {
        const fetchUser = async () => {
            const supabase = createClient();
            const { data } = await supabase.auth.getUser();
            if (data.user) {
                const name = data.user.user_metadata.full_name || data.user.email?.split('@')[0] || "User";
                setAuthorName(name);
            }
        };
        fetchUser();
    }, []);

    // Update type when initialType changes
    useEffect(() => {
        if (isOpen) {
            setType(initialType);
            setTitle('');
        }
    }, [isOpen, initialType]);

    // Auto-generate title based on type and dates
    useEffect(() => {
        if (type === 'report' && startDate && endDate) {
            try {
                const d1 = new Date(startDate);
                const d2 = new Date(endDate);
                const m1 = d1.toLocaleDateString('en-US', { month: 'short' });
                const m2 = d2.toLocaleDateString('en-US', { month: 'short' });
                const y1 = d1.getFullYear();
                const y2 = d2.getFullYear();
                const day1 = d1.getDate();
                const day2 = d2.getDate();

                let dateStr = '';
                if (y1 === y2 && m1 === m2) {
                    dateStr = `${day1}-${day2} ${m1} ${y1}`;
                } else if (y1 === y2) {
                    dateStr = `${day1} ${m1} - ${day2} ${m2} ${y1}`;
                } else {
                    dateStr = `${day1} ${m1} ${y1} - ${day2} ${m2} ${y2}`;
                }
                setTitle(`Report ${dateStr}`);
            } catch (e) {
                setTitle(`Report ${startDate}`);
            }
        } else if (type === 'meeting_note') {
            const dateStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            setTitle(`Meeting Note ${dateStr}`);
        } else if (type === 'ppt') {
            const dateStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            setTitle(`Presentation ${dateStr}`);
        }
    }, [type, startDate, endDate]);

    // Close date picker on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
                setShowDatePicker(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Calendar helpers
    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const startDay = firstDay === 0 ? 6 : firstDay - 1;
        return { daysInMonth, startDay, year, month };
    };

    const { daysInMonth, startDay, year, month } = getDaysInMonth(viewDate);
    const monthLabel = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const handleDayClick = (day: number) => {
        const clickedDate = new Date(year, month, day);
        const clickedStr = formatLocalYMD(clickedDate);

        if (!startDate || (startDate && endDate)) {
            setStartDate(clickedStr);
            setEndDate('');
        } else {
            if (new Date(clickedStr) < new Date(startDate)) {
                setStartDate(clickedStr);
                setEndDate(startDate);
            } else {
                setEndDate(clickedStr);
            }
            setShowDatePicker(false);
        }
    };

    const isSelected = (day: number) => {
        const currentDate = new Date(year, month, day);
        const dStr = formatLocalYMD(currentDate);
        return dStr === startDate || dStr === endDate;
    };

    const isInRange = (day: number) => {
        if (!startDate || !endDate) return false;
        const current = new Date(year, month, day);
        const dStr = formatLocalYMD(current);
        return dStr > startDate && dStr < endDate;
    };

    const formatDateShort = (d: string) => {
        if (!d) return '...';
        return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    };

    // Load generator scripts on mount
    const [scriptsLoaded, setScriptsLoaded] = useState(false);
    useEffect(() => {
        if (isOpen && !scriptsLoaded && driveSettings?.apiKey && driveSettings?.clientId) {
            initGoogleClient(driveSettings.apiKey, driveSettings.clientId)
                .then(() => setScriptsLoaded(true))
                .catch((e) => {
                    console.error("Failed to init Google", e);
                    toast.error("Error initializing Google Drive");
                });
        }
    }, [isOpen, driveSettings, scriptsLoaded]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!title.trim()) {
            toast.error("Please enter a title");
            return;
        }

        if (type === 'report' && (!startDate || !endDate)) {
            toast.error("Please select a date range");
            return;
        }

        setIsLoading(true);

        try {
            if (!scriptsLoaded) throw new Error("Google Scripts not loaded yet");

            // Generate Doc via Client
            const { generateMeetingNote, generateBlankReport, generatePresentation } = await import('@/lib/google/generator');

            // Determine folder ID based on type
            let targetFolderId = driveSettings?.folderId;
            if (type === 'report' && driveSettings?.reportFolderId) targetFolderId = driveSettings.reportFolderId;
            if (type === 'meeting_note' && driveSettings?.meetingFolderId) targetFolderId = driveSettings.meetingFolderId;
            if (type === 'ppt' && driveSettings?.pptFolderId) targetFolderId = driveSettings.pptFolderId;

            let fileResult;
            if (type === 'meeting_note') {
                // ... (existing meeting note logic)
                // Fetch pending tasks
                const tasksResult = await getTasksAction(groupId);
                let pendingTasks: any[] = [];
                let taskColumns: string[] = ["todo", "in_progress", "done"]; // Default

                if (tasksResult.data) {
                    // Get columns from result or default
                    if (tasksResult.columns && Array.isArray(tasksResult.columns)) {
                        taskColumns = tasksResult.columns;
                    }

                    // Filter: All tasks that are NOT done
                    pendingTasks = tasksResult.data
                        .filter((t: any) => !t.completed && t.status !== 'done')
                        .map((t: any) => ({
                            title: t.title,
                            status: t.status, // Keep status for grouping
                            // Format assignees names
                            assignees: t.assignees?.map((a: any) => a.profile.full_name).join(', ') || '',
                            dueDate: t.due_date ? new Date(t.due_date).toLocaleDateString('en-US') : ''
                        }));
                }

                // Get current time
                const now = new Date();
                const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                fileResult = await generateMeetingNote(
                    title,
                    {
                        authorName,
                        startDate: new Date().toLocaleDateString('en-US'),
                        time: timeString
                    },
                    pendingTasks,
                    taskColumns, // Pass columns for ordering
                    targetFolderId
                );
            } else if (type === 'ppt') {
                // Generate or Upload Presentation
                if (selectedFile) {
                    fileResult = await uploadFileToDrive(selectedFile, targetFolderId);
                } else {
                    fileResult = await generatePresentation(
                        title,
                        { authorName },
                        targetFolderId
                    );
                }
            } else {
                // For reports, use generateBlankReport
                fileResult = await generateBlankReport(
                    title,
                    { authorName },
                    targetFolderId
                );
            }

            if (!fileResult?.id) throw new Error("Error generating file");

            // ... (rest of the submission logic)


            if (!fileResult?.id) throw new Error("Error generating file");

            // Submit to Server
            const formData = new FormData();
            formData.append('title', title);
            formData.append('group_id', groupId);
            formData.append('type', type);
            formData.append('web_view_link', fileResult.webViewLink);
            formData.append('drive_file_id', fileResult.id);
            formData.append('sections', JSON.stringify({})); // Empty sections for new file
            // NOTE: If we created the file here, it exists in Drive. Status should be 'generated' to avoid 'draft' UI.
            formData.append('status', 'generated');

            // Add dates for reports
            if (type === 'report') {
                formData.append('start_date', startDate);
                formData.append('end_date', endDate);
            }

            const result = await createDriveReportAction(formData);
            if (result?.error) throw new Error(result.error);

            // Open the new doc
            window.open(fileResult.webViewLink, '_blank');

            toast.success('Document created successfully');
            onClose();

        } catch (err: any) {
            console.error('Error creating report:', err);
            toast.error(err.message || 'Error creating document');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in-0">
            <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
                    <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-indigo-600" />
                        {type === 'report' ? 'New Report' : type === 'meeting_note' ? 'New Meeting Note' : 'New Presentation'}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Date Range Picker - Only for Reports */}
                    {type === 'report' && (
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Report Period
                            </label>
                            <div className="relative" ref={datePickerRef}>
                                <button
                                    type="button"
                                    onClick={() => setShowDatePicker(!showDatePicker)}
                                    className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-3 py-2 rounded-lg transition-colors text-sm font-medium w-full"
                                >
                                    <CalendarDays className="w-4 h-4" />
                                    <span>
                                        {startDate ? (
                                            <>
                                                {formatDateShort(startDate)}
                                                {endDate ? ` - ${formatDateShort(endDate)}` : ' ...'}
                                            </>
                                        ) : (
                                            'Select dates'
                                        )}
                                    </span>
                                </button>

                                {showDatePicker && (
                                    <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 w-72 animate-in fade-in zoom-in-95 duration-200">
                                        <div className="flex justify-between items-center mb-4">
                                            <button
                                                type="button"
                                                onClick={() => setViewDate(new Date(year, month - 1))}
                                                className="p-1 hover:bg-slate-100 rounded-full text-slate-500"
                                            >
                                                <ChevronLeft className="w-5 h-5" />
                                            </button>
                                            <span className="font-bold text-slate-700 capitalize">{monthLabel}</span>
                                            <button
                                                type="button"
                                                onClick={() => setViewDate(new Date(year, month + 1))}
                                                className="p-1 hover:bg-slate-100 rounded-full text-slate-500"
                                            >
                                                <ChevronRight className="w-5 h-5" />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-7 mb-2">
                                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                                <div key={i} className="text-center text-xs font-bold text-slate-400">{d}</div>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-7 gap-y-1">
                                            {Array.from({ length: startDay }).map((_, i) => <div key={`empty-${i}`} />)}

                                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                                const day = i + 1;
                                                const selected = isSelected(day);
                                                const inRange = isInRange(day);

                                                return (
                                                    <button
                                                        key={day}
                                                        type="button"
                                                        onClick={() => handleDayClick(day)}
                                                        className={cn(
                                                            "w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center mx-auto transition-all relative",
                                                            selected ? 'bg-indigo-600 text-white z-10' : 'text-slate-700 hover:bg-slate-100',
                                                            inRange && !selected ? 'bg-indigo-100 rounded-none w-full mx-0' : '',
                                                            selected && startDate && !endDate ? 'ring-2 ring-indigo-200' : ''
                                                        )}
                                                    >
                                                        {day}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="mt-3 pt-3 border-t border-slate-100 text-center text-[10px] text-slate-400">
                                            {!startDate ? 'Select start date' : !endDate ? 'Select end date' : 'Range selected'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Title */}
                    <div>
                        <label htmlFor="title" className="text-sm font-medium text-slate-700 block mb-2">
                            Document Title
                        </label>
                        <input
                            required
                            type="text"
                            name="title"
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Enter title..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        />
                    </div>

                    {/* PPT Upload or Info Box */}
                    {type === 'ppt' ? (
                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-slate-700">
                                Presentation or PDF File (Optional)
                            </label>
                            <div className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors relative ${selectedFile ? 'border-indigo-300 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                                <input
                                    type="file"
                                    accept=".pptx,.ppt,application/vnd.google-apps.presentation,.pdf,application/pdf"
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            setSelectedFile(file);
                                            // Auto-fill title from filename
                                            setTitle(file.name.replace(/\.[^/.]+$/, ""));
                                        }
                                    }}
                                />
                                {selectedFile ? (
                                    <div className="text-center relative z-20">
                                        <FileText className="w-10 h-10 text-indigo-600 mx-auto mb-2" />
                                        <p className="text-sm font-medium text-slate-800 truncate max-w-[200px]">{selectedFile.name}</p>
                                        <p className="text-xs text-slate-500 mb-2">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                setSelectedFile(null);
                                            }}
                                            className="text-xs text-red-600 font-medium hover:underline pointer-events-auto relative z-30"
                                        >
                                            Remove / Replace
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center pointer-events-none">
                                        <FileUp className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                                        <p className="text-sm font-medium text-slate-700">Click or drag to upload</p>
                                        <p className="text-xs text-slate-500 mt-1">.pptx, .ppt, .pdf</p>
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 text-center">
                                {selectedFile ? 'This file will be uploaded to Drive.' : 'Leave empty to create a blank presentation.'}
                            </p>
                        </div>
                    ) : (
                        <div className="p-3 bg-indigo-50 rounded-lg text-sm text-slate-600 border border-indigo-100">
                            <p>
                                {type === 'meeting_note'
                                    ? 'A Meeting Note will be created in Google Docs with the predefined template and opened for editing.'
                                    : 'A blank Google Doc will be created.'
                                }
                            </p>
                            <div className="mt-2 text-xs text-slate-500">
                                {scriptsLoaded ? '✅ Ready to create' : '⏳ Loading...'}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg"
                            disabled={isLoading}
                        >
                            Cancel
                        </button>
                        <div className="flex gap-3">
                            {type === 'report' && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowDraftEditor(true);
                                    }}
                                    disabled={isLoading || !title.trim() || !startDate || !endDate}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
                                >
                                    <Edit3 size={16} />
                                    Create Draft
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={isLoading || !scriptsLoaded}
                                className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
                            >
                                {isLoading && <Loader2 size={16} className="animate-spin" />}
                                {isLoading
                                    ? 'Creating...'
                                    : type === 'meeting_note'
                                        ? 'Create Meeting Note'
                                        : type === 'ppt'
                                            ? 'Create Presentation'
                                            : 'Create & Open'
                                }
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* Draft Editor Modal */}
            <DraftEditorModal
                isOpen={showDraftEditor}
                onClose={() => {
                    setShowDraftEditor(false);
                    onClose(); // Also close the parent modal
                }}
                groupId={groupId}
                initialData={{
                    title,
                    startDate,
                    endDate,
                    type,
                }}
                driveSettings={driveSettings}
            />
        </div>
    );
}
