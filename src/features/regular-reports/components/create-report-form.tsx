'use client';

import { createRegularReportAction } from '../actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface ReportFormProps {
    groupId: string;
}

export function CreateReportForm({ groupId }: ReportFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.currentTarget);
        formData.append('group_id', groupId);

        const result = await createRegularReportAction(formData);

        if (result?.error) {
            toast.error(result.error);
            setLoading(false);
        } else {
            toast.success("Report created successfully");
            // Redirect to the detail page of the new report
            router.push(`/${groupId}/reports/${result.report?.id}`);
        }
    };

    // Calculate default dates (current week)
    const today = new Date();
    // Monday
    const first = today.getDate() - today.getDay() + 1;
    const monday = new Date(today.setDate(first)).toISOString().split('T')[0];
    // Friday
    const friday = new Date(today.setDate(first + 4)).toISOString().split('T')[0];

    return (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border shadow-sm max-w-2xl mx-auto space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">New Weekly Report</h2>
                <p className="text-sm text-slate-500">Create a blank report for this week.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700">Week Start</label>
                    <input
                        type="date"
                        name="week_start"
                        required
                        defaultValue={monday}
                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700">Week End</label>
                    <input
                        type="date"
                        name="week_end"
                        required
                        defaultValue={friday}
                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={loading}
                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 transition-colors font-medium"
                >
                    {loading && <Loader2 className="animate-spin" size={18} />}
                    Create Draft
                </button>
            </div>
        </form>
    );
}
