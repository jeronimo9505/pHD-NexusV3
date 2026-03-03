import React, { useState } from 'react';
import DriveExplorer from './components/DriveExplorer';
import DriveSettings from './components/DriveSettings';
import { useApp } from '@/context/AppContext';

export default function Drive() {
    const { activeGroup, updateGroupSettings, activeGroupId } = useApp();
    const [showSettings, setShowSettings] = useState(false);

    // Settings are now derived directly from the active group config
    // We look for a 'googleDrive' key in the config object
    const settings = activeGroup?.drive_settings?.googleDrive || activeGroup?.config?.googleDrive || null;

    const handleSaveSettings = async (newSettings) => {
        if (activeGroupId && updateGroupSettings) {
            // Merge with existing drive_settings to avoid overwriting other module configs
            const currentDriveSettings = activeGroup?.drive_settings || {};
            await updateGroupSettings(activeGroupId, { ...currentDriveSettings, googleDrive: newSettings });
            setShowSettings(false);
        } else {
            alert("Error: No se puede guardar. Verifica que haya un grupo activo.");
        }
    };

    const handleOpenSettings = () => {
        setShowSettings(true);
    };

    if (showSettings) {
        return (
            <div className="h-full p-8 overflow-y-auto bg-slate-50/50">
                <DriveSettings
                    initialSettings={settings}
                    onSave={handleSaveSettings}
                    onCancel={() => setShowSettings(false)}
                />
            </div>
        );
    }

    return (
        <DriveExplorer
            settings={settings}
            onSettingsClick={handleOpenSettings}
        />
    );
}
