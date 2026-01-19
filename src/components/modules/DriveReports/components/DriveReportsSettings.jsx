import React, { useState } from 'react';
import { Save, Key, FileText, AlertTriangle, Shield, Check } from 'lucide-react';

export default function DriveReportsSettings({ onSave, initialSettings = {}, onCancel }) {
    // We expect settings to be stored in group.drive_settings usually
    const [templateId, setTemplateId] = useState(initialSettings?.templateId || '');
    // Some users might want separate credentials for Reports if they use a service account or different project, 
    // but usually it's the same. However, user asked for "configuration for credentials AND api".
    // So we replicate the inputs, but maybe we can just link to global drive settings? 
    // The user strictly said: "give configuration section to add credentials and API... configured for whole group"
    // So let's provide fields.
    const [clientId, setClientId] = useState(initialSettings?.clientId || '');
    const [apiKey, setApiKey] = useState(initialSettings?.apiKey || '');
    // Improved cleanId to extract the actual ID from a full Google Drive URL if pasted
    const cleanId = (id) => {
        if (!id) return '';
        let trimmed = id.trim();
        // If it looks like a URL, extract the last part
        if (trimmed.includes('drive.google.com')) {
            // Handle folders/ID or file/d/ID
            const parts = trimmed.split('/');
            const lastPart = parts[parts.length - 1].split('?')[0].split('&')[0];
            // If the last part is "folders" or empty, try the second to last
            if ((lastPart === 'folders' || !lastPart) && parts.length > 1) {
                return parts[parts.length - 2].split('?')[0].split('&')[0];
            }
            return lastPart;
        }
        return trimmed.split('?')[0].split('&')[0];
    };
    const [folderId, setFolderId] = useState(cleanId(initialSettings?.folderId));
    const [pptFolderId, setPptFolderId] = useState(cleanId(initialSettings?.pptFolderId));
    const [meetingsFolderId, setMeetingsFolderId] = useState(cleanId(initialSettings?.meetingsFolderId));

    // Derived state or validation could go here

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            templateId: cleanId(templateId),
            folderId: cleanId(folderId),
            pptFolderId: cleanId(pptFolderId),
            meetingsFolderId: cleanId(meetingsFolderId),
            clientId: clientId.trim(),
            apiKey: apiKey.trim()
        });
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                    <Shield className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800">Configuración de Reportes Drive</h3>
                    <p className="text-xs text-slate-500">Credenciales y Plantilla para el Grupo</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">

                {/* Credentials Section */}
                <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Key className="w-4 h-4" /> Credenciales Google Docs API
                    </h4>
                    <p className="text-xs text-slate-500 mb-2">
                        Estas credenciales permitirán al sistema crear y modificar documentos en nombre de los usuarios del grupo.
                    </p>

                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Client ID</label>
                            <input
                                type="text"
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                placeholder="Ej: 123...apps.googleusercontent.com"
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                            <input
                                type="text"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Ej: AIzaSy..."
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    </div>
                </div>

                <div className="h-px bg-slate-100 my-2" />

                {/* Folders & Templates Section */}
                <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Carpetas y Plantillas
                    </h4>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">ID Carpeta Reportes PPT</label>
                            <input
                                type="text"
                                value={pptFolderId}
                                onChange={(e) => setPptFolderId(e.target.value)}
                                placeholder="ID de la carpeta para subir PowerPoints"
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">ID Carpeta Meeting Notes</label>
                            <input
                                type="text"
                                value={meetingsFolderId}
                                onChange={(e) => setMeetingsFolderId(e.target.value)}
                                placeholder="ID de la carpeta para Meeting Notes"
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="h-px bg-slate-100 my-2" />

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">ID del Documento Plantilla (Reporte Periodo)</label>
                        <input
                            type="text"
                            value={templateId}
                            onChange={(e) => setTemplateId(e.target.value)}
                            placeholder="Dejar vacío para usar Generación Automática"
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                            El ID se encuentra en la URL del documento: docs.google.com/document/d/<b>ID_AQUI</b>/edit
                        </p>
                    </div>

                    <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-lg flex gap-2 items-start mt-4">
                        <div className="mt-0.5 shrink-0">ℹ️</div>
                        <div>
                            <strong>Generación Automática:</strong> Si dejas este campo vacío, el sistema generará un documento nuevo con la estructura predefinida (Intro, Experimental, Hallazgos, etc.) automáticamente. ¡No necesitas crear una plantilla manual!
                        </div>
                    </div>
                </div>

                <div className="h-px bg-slate-100 my-2" />

                {/* Folder Section */}
                <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <div className="w-4 h-4 flex items-center justify-center bg-slate-200 rounded text-[10px] text-slate-500 font-bold">📂</div>
                        Carpeta de Destino (Opcional)
                    </h4>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">ID de la Carpeta</label>
                        <input
                            type="text"
                            value={folderId}
                            onChange={(e) => setFolderId(e.target.value)}
                            placeholder="Ej: 1A2b3C..."
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                            Dejar vacío para crear en "Mi unidad" (raíz).
                        </p>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" /> Guardar Configuración
                    </button>
                </div>

            </form>
        </div>
    );
}
