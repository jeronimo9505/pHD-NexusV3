'use client';

import { useState, useEffect } from 'react';
import { loadGoogleScripts, requestAccessToken, openPicker } from '@/lib/google/picker';
import { initGoogleClient } from '@/lib/google/auth';
import { Loader2, FileUp, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface DrivePickerButtonProps {
    clientId?: string;
    apiKey?: string;
    viewId?: string; // 'DOCS' or 'FOLDERS'
    onSelect: (file: any) => void;
    label?: string;
    className?: string; // Allow custom styling
}

export function DrivePickerButton({
    clientId,
    apiKey,
    viewId = 'DOCS',
    onSelect,
    label = "Select from Drive",
    className
}: DrivePickerButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isReady, setIsReady] = useState(false);

    // Sanitize credentials
    const safeClientId = clientId?.trim();
    const safeApiKey = apiKey?.trim();

    useEffect(() => {
        if (safeClientId && safeApiKey) {
            initGoogleClient(safeApiKey, safeClientId)
                .then(() => setIsReady(true))
                .catch((err) => {
                    console.error("Failed to load Google Scripts", err);
                    toast.error("Failed to initialize Google Drive integration");
                });
        }
    }, [safeClientId, safeApiKey]);

    const handlePick = async () => {
        if (!safeClientId || !safeApiKey) {
            toast.error("Google Drive is not configured for this group.");
            return;
        }

        setIsLoading(true);
        try {
            // 1. Get Access Token (Triggers Popup)
            // Use safeClientId
            const token = await requestAccessToken(safeClientId);

            // 2. Open Picker
            openPicker({
                clientId: safeClientId,
                apiKey: safeApiKey,
                token,
                viewId,
                onSelect: (file) => {
                    onSelect(file);
                    // Ensure loading state is cleared quickly
                }
            });
        } catch (error) {
            console.error("Picker Error", error);
            toast.error("Failed to access Google Drive. Please check permissions.");
        } finally {
            setIsLoading(false);
        }
    };

    if (!safeClientId || !safeApiKey) {
        return (
            <button
                type="button"
                disabled
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-600 bg-amber-50 rounded-lg border border-amber-200 cursor-not-allowed opacity-70 ${className}`}
                title="Drive integration not configured"
            >
                <AlertTriangle size={16} />
                Drive Not Configured
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={handlePick}
            disabled={!isReady || isLoading}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-70 ${className}`}
        >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
            {label}
        </button>
    );
}
