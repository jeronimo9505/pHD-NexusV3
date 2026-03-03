import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { updateReportMetadataAction } from '../actions';
import { ReportType } from '../types';
import { Loader2, X } from 'lucide-react';

interface EditReportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    report: {
        id: string;
        title: string;
        type: ReportType;
    };
    groupId: string;
}

export function EditReportDialog({ isOpen, onClose, report, groupId }: EditReportDialogProps) {
    const [title, setTitle] = useState(report.title);
    const [type, setType] = useState<ReportType>(report.type);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setTitle(report.title);
            setType(report.type);
        }
    }, [isOpen, report]);

    const handleSave = async () => {
        if (!title.trim()) {
            toast.error("Title cannot be empty");
            return;
        }

        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('report_id', report.id);
            formData.append('title', title);
            formData.append('type', type);
            formData.append('group_id', groupId);

            const result = await updateReportMetadataAction(formData);

            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success("Report updated successfully");
                onClose();
            }
        } catch (error) {
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                    <h2 className="text-lg font-semibold text-slate-800">Edit Report Details</h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="title" className="block text-sm font-medium text-slate-700">Title</label>
                        <input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Report Title"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="type" className="block text-sm font-medium text-slate-700">Type</label>
                        <select
                            id="type"
                            value={type}
                            onChange={(e) => setType(e.target.value as ReportType)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-slate-800"
                        >
                            <option value="report">Scientific Report</option>
                            <option value="meeting_note">Meeting Note</option>
                            <option value="ppt">Presentation</option>
                        </select>
                        <p className="text-xs text-slate-500">
                            Changing the type will update the icon and color in the list.
                        </p>
                    </div>
                </div>

                <div className="flex justify-end gap-3 p-4 border-t border-slate-100 bg-slate-50/50">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 flex items-center gap-2 transition-colors"
                    >
                        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
