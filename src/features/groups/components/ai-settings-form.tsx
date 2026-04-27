'use client';

import { useState } from 'react';
import { updateAISettingsAction } from '../actions';
import { toast } from 'sonner';
import { Key, Save, Shield, HelpCircle, Loader2, Sparkles } from 'lucide-react';

interface AISettingsFormProps {
    groupId: string;
    initialSettings?: {
        geminiApiKey?: string;
        model?: string;
    };
}

export function AISettingsForm({ groupId, initialSettings }: AISettingsFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        formData.append('groupId', groupId);

        try {
            const result = await updateAISettingsAction(formData);
            if (result?.error) {
                toast.error(result.error);
            } else {
                toast.success('AI Settings saved successfully');
            }
        } catch (error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-indigo-50/30 flex items-start gap-4">
                <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
                    <Sparkles size={24} />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-slate-800">Nexus AI Integration</h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Configure your Google Gemini API key to enable Nexus AI for this group.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                            <Key className="w-4 h-4 text-slate-400" /> Google Gemini API Key
                        </label>
                        <input
                            required
                            type="password"
                            name="geminiApiKey"
                            defaultValue={initialSettings?.geminiApiKey}
                            placeholder="AIzaSyD..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                            This key will be used by all members of this group for AI features.
                        </p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-slate-400" /> Gemini Model
                        </label>
                        <select
                            name="model"
                            defaultValue={initialSettings?.model || 'gemini-2.0-flash-lite'}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-white"
                        >
                            <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite (Fast & Efficient)</option>
                            <option value="gemini-2.0-flash">Gemini 2.0 Flash (Balanced)</option>
                            <option value="gemini-1.5-pro">Gemini 1.5 Pro (Most Capable)</option>
                            <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy)</option>
                        </select>
                        <p className="text-xs text-slate-400 mt-1">
                            Select the model version to use for Nexus AI chat and tools.
                        </p>
                    </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                    <button
                        type="button"
                        onClick={() => setShowHelp(!showHelp)}
                        className="text-sm font-medium text-indigo-700 flex items-center gap-2 hover:underline"
                    >
                        <HelpCircle size={16} />
                        {showHelp ? 'Hide Guide' : 'How to get a Gemini API Key?'}
                    </button>

                    {showHelp && (
                        <div className="mt-3 text-sm text-indigo-800/80 space-y-1 pl-6 list-disc">
                            <p>1. Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline font-semibold">Google AI Studio</a>.</p>
                            <p>2. Create a new API Key (Get API Key).</p>
                            <p>3. Copy the key and paste it here.</p>
                            <p className="mt-2 text-[11px] italic text-slate-500">Note: Use a Gemini 1.5 Flash or Pro compatible key.</p>
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
                        Save AI Settings
                    </button>
                </div>
            </form>
        </div>
    );
}
