import React, { useState, useEffect } from 'react';
import { Save, Key, Folder, Shield, AlertTriangle } from 'lucide-react';

export default function DriveSettings({ onSave, initialSettings, onCancel }) {
    const [clientId, setClientId] = useState(initialSettings?.clientId || '');
    const [apiKey, setApiKey] = useState(initialSettings?.apiKey || '');
    const [folderId, setFolderId] = useState(initialSettings?.folderId || '');
    const [showGuide, setShowGuide] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ clientId, apiKey, folderId });
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl mx-auto mt-10">
            <div className="flex items-center gap-3 mb-6">
                <div className="bg-indigo-100 p-3 rounded-lg">
                    <Shield className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Conexión a Google Drive</h2>
                    <p className="text-sm text-slate-500">Configura tus credenciales para acceder a tus archivos.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">

                {/* Credentials Inputs */}
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Key className="w-4 h-4 text-slate-400" /> Client ID
                        </label>
                        <input
                            type="text"
                            required
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            placeholder="Ej: 123456789-abc...apps.googleusercontent.com"
                            className="w-full p-3 bg-slate-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 outline-none transition-all font-mono"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Key className="w-4 h-4 text-slate-400" /> API Key
                        </label>
                        <input
                            type="text"
                            required
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Ej: AIzaSyD..."
                            className="w-full p-3 bg-slate-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 outline-none transition-all font-mono"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Folder className="w-4 h-4 text-slate-400" /> ID de la Carpeta (Folder ID)
                        </label>
                        <input
                            type="text"
                            required
                            value={folderId}
                            onChange={(e) => setFolderId(e.target.value)}
                            placeholder="El código al final de la URL de tu carpeta de Drive"
                            className="w-full p-3 bg-slate-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 outline-none transition-all font-mono"
                        />
                        <p className="text-xs text-slate-400 pl-1">Ejemplo: si la URL es drive.google.com/drive/folders/<b>1A2b3C...</b>, el ID es <b>1A2b3C...</b></p>
                    </div>
                </div>

                {/* Helper / Guide Toggle */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm">
                    <button
                        type="button"
                        onClick={() => setShowGuide(!showGuide)}
                        className="text-blue-700 font-bold flex items-center gap-2 hover:underline"
                    >
                        <AlertTriangle className="w-4 h-4" />
                        {showGuide ? 'Ocultar guía de ayuda' : '¿Cómo obtener estas claves?'}
                    </button>

                    {showGuide && (
                        <div className="mt-3 space-y-2 text-blue-800/80 pl-6 list-disc">
                            <p>1. Ve a <a href="https://console.cloud.google.com/" target="_blank" className="underline">Google Cloud Console</a>.</p>
                            <p>2. Crea un proyecto nuevo.</p>
                            <p>3. Habilita la <b>Google Drive API</b> en "APIs y Servicios".</p>
                            <p>4. En "Credenciales", crea una <b>API Key</b>.</p>
                            <p>5. Crea un <b>ID de cliente de OAuth 2.0</b> (Aplicación Web).</p>
                            <p>6. Añade <code>http://localhost:3000</code> en "Orígenes de JavaScript autorizados".</p>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 py-3 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        Cancelar / Modo Demo
                    </button>
                    <button
                        type="submit"
                        className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                    >
                        <Save className="w-4 h-4" /> Guardar y Conectar
                    </button>
                </div>

            </form>
        </div>
    );
}
