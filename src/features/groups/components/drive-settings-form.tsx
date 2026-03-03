'use client';

import { useState } from 'react';
import { updateDriveSettingsAction } from '../actions';
import { toast } from 'sonner';
import { Key, Folder, Save, Shield, HelpCircle, Loader2, Search, CalendarDays } from 'lucide-react';
import { DriveFileSelectorModal } from '../../drive-reports/components/drive-file-selector-modal';

interface DriveSettingsFormProps {
    groupId: string;
    initialSettings?: {
        clientId?: string;
        apiKey?: string;
        folderId?: string;
        reportFolderId?: string;
        meetingFolderId?: string;
        pptFolderId?: string;
        sampleFolderId?: string;
        calendarId?: string;
    };
}

export function DriveSettingsForm({ groupId, initialSettings }: DriveSettingsFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    // Add new state for folder picker
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [activeFolderField, setActiveFolderField] = useState<'folderId' | 'reportFolderId' | 'meetingFolderId' | 'pptFolderId' | 'sampleFolderId' | null>(null);
    const [formValues, setFormValues] = useState({
        folderId: initialSettings?.folderId || '',
        reportFolderId: initialSettings?.reportFolderId || '',
        meetingFolderId: initialSettings?.meetingFolderId || '',
        pptFolderId: initialSettings?.pptFolderId || '',
        sampleFolderId: initialSettings?.sampleFolderId || '',
        calendarId: initialSettings?.calendarId || '',
    });

    const handleOpenFolderSelector = (field: typeof activeFolderField) => {
        setActiveFolderField(field);
        setShowFolderModal(true);
    };

    const handleFolderSelect = (file: { id: string }) => {
        if (activeFolderField) {
            setFormValues(prev => ({ ...prev, [activeFolderField]: file.id }));
        }
        setShowFolderModal(false);
        setActiveFolderField(null);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        formData.append('groupId', groupId);

        // Ensure controlled values are in FormData
        formData.set('folderId', formValues.folderId);
        formData.set('reportFolderId', formValues.reportFolderId);
        formData.set('meetingFolderId', formValues.meetingFolderId);
        formData.set('pptFolderId', formValues.pptFolderId);
        formData.set('sampleFolderId', formValues.sampleFolderId);
        formData.set('calendarId', formValues.calendarId);

        try {
            const result = await updateDriveSettingsAction(formData);
            if (result?.error) {
                toast.error(result.error);
            } else {
                toast.success('Settings saved successfully');
            }
        } catch (error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-start gap-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                    <Shield size={24} />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-slate-800">Google Drive Integration</h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Configure your credentials to enable Google Picker and Drive integration for this group.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                            <Key className="w-4 h-4 text-slate-400" /> Client ID
                        </label>
                        <input
                            required
                            name="clientId"
                            defaultValue={initialSettings?.clientId}
                            placeholder="e.g. 12345...apps.googleusercontent.com"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent font-mono text-sm"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                            <Key className="w-4 h-4 text-slate-400" /> API Key
                        </label>
                        <input
                            required
                            name="apiKey"
                            defaultValue={initialSettings?.apiKey}
                            placeholder="e.g. AIzaSyD..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent font-mono text-sm"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                            <Folder className="w-4 h-4 text-slate-400" /> Root Folder ID (Default)
                        </label>
                        <div className="flex gap-2">
                            <input
                                required
                                name="folderId"
                                value={formValues.folderId}
                                onChange={(e) => setFormValues({ ...formValues, folderId: e.target.value })}
                                placeholder="The ID from your folder URL"
                                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent font-mono text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => handleOpenFolderSelector('folderId')}
                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition"
                                title="Select Drive Folder"
                            >
                                <Search size={18} />
                            </button>
                        </div>
                        <p className="text-xs text-slate-400">Example: drive.google.com/drive/folders/<b>1A2b3C...</b></p>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">Specific Folders (Optional)</h3>
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                    <Folder className="w-4 h-4 text-blue-400" /> Report Folder ID
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        name="reportFolderId"
                                        value={formValues.reportFolderId}
                                        onChange={(e) => setFormValues({ ...formValues, reportFolderId: e.target.value })}
                                        placeholder="Folder for Scientific Reports"
                                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleOpenFolderSelector('reportFolderId')}
                                        className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition"
                                        title="Select Drive Folder"
                                    >
                                        <Search size={18} />
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                    <Folder className="w-4 h-4 text-purple-400" /> Meeting Note Folder ID
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        name="meetingFolderId"
                                        value={formValues.meetingFolderId}
                                        onChange={(e) => setFormValues({ ...formValues, meetingFolderId: e.target.value })}
                                        placeholder="Folder for Meeting Minutes"
                                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleOpenFolderSelector('meetingFolderId')}
                                        className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg transition"
                                        title="Select Drive Folder"
                                    >
                                        <Search size={18} />
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                    <Folder className="w-4 h-4 text-orange-400" /> Presentation Folder ID
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        name="pptFolderId"
                                        value={formValues.pptFolderId}
                                        onChange={(e) => setFormValues({ ...formValues, pptFolderId: e.target.value })}
                                        placeholder="Folder for Presentations"
                                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleOpenFolderSelector('pptFolderId')}
                                        className="px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-lg transition"
                                        title="Select Drive Folder"
                                    >
                                        <Search size={18} />
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                    <Folder className="w-4 h-4 text-emerald-500" /> Samples Logbook Folder ID
                                    <span className="text-xs text-slate-400 font-normal">(optional — uses Root Folder if empty)</span>
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        name="sampleFolderId"
                                        value={formValues.sampleFolderId}
                                        onChange={(e) => setFormValues({ ...formValues, sampleFolderId: e.target.value })}
                                        placeholder="Folder for Sample Logbook reports"
                                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleOpenFolderSelector('sampleFolderId')}
                                        className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition"
                                        title="Select Drive Folder"
                                    >
                                        <Search size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Google Calendar */}
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                    <CalendarDays className="w-4 h-4 text-indigo-500" /> Google Calendar ID
                                    <span className="text-xs text-slate-400 font-normal">(optional — for the Calendar module)</span>
                                </label>
                                <input
                                    name="calendarId"
                                    value={formValues.calendarId}
                                    onChange={(e) => setFormValues({ ...formValues, calendarId: e.target.value })}
                                    placeholder="e.g. c.xxx@group.calendar.google.com"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                                />
                                <p className="text-xs text-slate-400">Find this in Google Calendar → Settings → Integrate calendar → <b>Calendar ID</b></p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                    <button
                        type="button"
                        onClick={() => setShowHelp(!showHelp)}
                        className="text-sm font-medium text-blue-700 flex items-center gap-2 hover:underline"
                    >
                        <HelpCircle size={16} />
                        {showHelp ? 'Hide Guide' : 'How to get these keys?'}
                    </button>

                    {showHelp && (
                        <div className="mt-3 text-sm text-blue-800/80 space-y-1 pl-6 list-disc">
                            <p>1. Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="underline font-semibold">Google Cloud Console</a>.</p>
                            <p>2. Create a project and enable <b>Google Drive API</b> and <b>Google Picker API</b>.</p>
                            <p>3. Create an <b>API Key</b> in Credentials.</p>
                            <p>4. Create an <b>OAuth 2.0 Client ID</b> (Web Application).</p>
                            <p>5. Add your domain to Authorized Origins.</p>
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t flex justify-end">
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-70"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        Save Settings
                    </button>
                </div>
            </form>

            <DriveFileSelectorModal
                isOpen={showFolderModal}
                onClose={() => setShowFolderModal(false)}
                onSelect={handleFolderSelect}
                driveSettings={{
                    clientId: initialSettings?.clientId,
                    apiKey: initialSettings?.apiKey,
                    folderId: initialSettings?.folderId // Start at root if not set
                }}
                selectionMode="folder"
            />
        </div>
    );
}
