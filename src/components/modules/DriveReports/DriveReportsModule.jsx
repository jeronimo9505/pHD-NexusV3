import React, { useState } from 'react';
import ReportLibrary from './components/ReportLibrary';
import ReportDetail from './components/ReportDetail';
import CreateReportModal from './components/CreateReportModal';
import DriveReportsSettings from './components/DriveReportsSettings';
import { googleDriveService } from '@/components/modules/Drive/services/googleDriveService';
import { Loader2 } from 'lucide-react';
import ReportEditor from './components/ReportEditor';
import { useApp } from '@/context/AppContext';
import { useTasks } from '../Tasks/hooks/useTasks';

export default function DriveReportsModule() {
    const { activeGroup, userRole, updateGroupSettings, deleteDriveReport, updateDriveReport, addDriveReport, currentUser, selectedReportId, setSelectedReportId, driveReports } = useApp();
    const { tasks: allTasks } = useTasks();
    const [view, setView] = useState('library'); // library, detail, settings
    const [selectedReport, setSelectedReport] = useState(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [initializing, setInitializing] = useState(true);
    const [isUploading, setIsUploading] = useState(false);

    const handleSelectReport = React.useCallback(async (report) => {
        // STRICT CHECK: If report is marked as generated ('pending'), NEVER open editor.
        if (report.status === 'pending' || report.type === 'ppt') { // Also handle PPT simply opening link
            let link = report.webViewLink;
            let id = report.drive_file_id;

            // Option 1: We have the link/ID
            if (id) {
                // If it's a PPT, fallback to drive view or preview
                // If it's a Doc (which current ones are mostly), force /edit for better UX
                const isDoc = !report.type || report.type === 'report' || report.type === 'meeting_note';
                const baseUrl = isDoc ? `https://docs.google.com/document/d/${id}/edit` : `https://drive.google.com/file/d/${id}/view`;

                window.open(baseUrl, '_blank');
                return;
            }
            if (link) {
                window.open(link, '_blank');
                return;
            }

            // Option 2: Recovery - Search in Drive
            // User requested: "hacer una validacion y buscar el documento"
            const doSearch = window.confirm(
                "Este archivo figura como 'Enviado' pero no tiene el enlace. ¿Deseas buscarlo en Drive por su nombre?"
            );

            if (doSearch) {
                try {
                    // Show some loading indicator? Using alert for simplicity for now or pure async
                    const files = await googleDriveService.findFileByName(report.title);

                    if (files && files.length > 0) {
                        // Best match
                        const match = files[0];
                        // Update local DB to fix this for next time
                        if (updateDriveReport) {
                            await updateDriveReport(report.id, {
                                drive_file_id: match.id,
                                webViewLink: match.webViewLink
                            });
                        }

                        window.open(match.webViewLink, '_blank');
                    } else {
                        alert("No se encontró ningún archivo con ese nombre en Drive.");
                    }
                } catch (e) {
                    console.error("Search failed", e);
                    alert("Error buscando el archivo en Drive.");
                }
            }

            return; // EXIT, do not open editor
        }

        // Draft -> Editor
        setSelectedReport(report);
        setView('detail');
    }, [updateDriveReport]);

    // Deep Linking Effect - Moved here (BEFORE return) to fix Hook Order
    React.useEffect(() => {
        if (selectedReportId && driveReports.length > 0) {
            const report = driveReports.find(r => r.id === selectedReportId);
            if (report) {
                // Determine action based on status
                if (report.status === 'draft') {
                    setSelectedReport(report);
                    setView('detail');
                } else {
                    handleSelectReport(report);
                }
                // Clear the selection so it doesn't trigger again on nav back
                setSelectedReportId(null);
            }
        }
    }, [selectedReportId, driveReports, handleSelectReport, setSelectedReportId]);


    // Initialize Google API
    React.useEffect(() => {
        let mounted = true;
        const init = async () => {
            try {
                // Timeout promise to prevent infinite loading
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout initializing Google API")), 8000)
                );

                const loadPromise = async () => {
                    await googleDriveService.loadGoogleScripts();
                    // Get Credentials from Config or Env
                    const clientId = activeGroup?.drive_settings?.clientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
                    const apiKey = activeGroup?.drive_settings?.apiKey || process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

                    if (clientId && apiKey) {
                        await googleDriveService.initializeGapiClient(apiKey, clientId);
                        // Try to restore existing session
                        googleDriveService.tryRestoreToken();
                    } else {
                        console.warn("Drive Reports: No API Credentials found.");
                    }
                };

                // Race between load and timeout
                await Promise.race([loadPromise(), timeoutPromise]);

            } catch (err) {
                console.error("Failed to initialize Google API for Reports:", err);
                if (mounted) {
                    // alert("No se pudo conectar con Google Docs. Verifica tu conexión o credenciales.");
                    // Optional: toast or silent fail. Alert is annoying on reload if it's just a flake.
                }
            } finally {
                if (mounted) setInitializing(false);
            }
        };

        if (activeGroup) {
            init();
        } else {
            // If no active group yet, maybe wait? Or just finish init?
            // If we wait forever for activeGroup, it might hang if context is slow?
            // Usually activeGroup loads fast. Let's add a fallback check.
            const t = setTimeout(() => { if (mounted) setInitializing(false); }, 10000);
            return () => clearTimeout(t);
        }

        return () => { mounted = false; };
    }, [activeGroup]);

    if (initializing) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-50/50">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <span className="ml-2 text-slate-500 font-medium">Conectando con Google Docs...</span>
            </div>
        );
    }

    // Permission check for settings
    // Includes 'student' for testing purposes/easy access
    const canConfigure = ['admin', 'supervisor', 'system_admin', 'owner', 'pi', 'student'].includes(userRole) || activeGroup?.role === 'owner';



    const handleBack = React.useCallback(() => {
        setSelectedReport(null);
        setView('library');
    }, []);

    const handleCreateNew = async (type = 'report') => {
        // HANDLING MEETING NOTES
        if (type === 'meeting_note') {
            const folderId = activeGroup?.drive_settings?.meetingsFolderId;

            if (!folderId) {
                alert("No se ha configurado la carpeta para 'Meeting Notes'. Por favor ve a Configuración.");
                setView('settings');
                return;
            }

            try {
                if (!googleDriveService.hasValidToken()) {
                    await googleDriveService.requestAccessToken();
                }

                setIsUploading(true); // Reuse loading state

                // Get Open Tasks
                const openTasks = allTasks ? allTasks.filter(t => t.status !== 'done') : [];

                // Format Date: 20-Ene-2026
                const dateObj = new Date();
                const day = dateObj.getDate();
                const month = dateObj.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''); // ene
                const year = dateObj.getFullYear();
                const formattedDate = `${day}-${month.charAt(0).toUpperCase() + month.slice(1)}-${year}`;

                const userName = currentUser?.full_name || 'Usuario';
                const title = `Minuta ${formattedDate} - ${userName}`;

                const file = await googleDriveService.createMeetingNoteDoc(
                    title,
                    {
                        startDate: dateObj.toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), // Display in doc as "20 Ene 2026, 15:30"
                        authorName: userName
                    },
                    folderId,
                    openTasks
                );

                // Save to DB
                await addDriveReport({
                    title: file.name,
                    status: 'draft',
                    type: 'meeting_note',
                    drive_file_id: file.id,
                    webViewLink: file.webViewLink,
                    author_name: currentUser?.full_name,
                    author_id: currentUser?.id,
                    group_id: activeGroup?.id,
                    group_id: activeGroup?.id,
                    created_at: new Date().toISOString(),
                    submitted_at: new Date().toISOString(), // Treat as submitted immediately
                    startDate: new Date().toISOString(), // Use creation date as start date for sorting
                    sections: {}
                });

                // Open Doc
                if (file.webViewLink) window.open(file.webViewLink, '_blank');

            } catch (e) {
                console.error("Error creating meeting note", e);
                alert("Error creando nota: " + e.message);
            } finally {
                setIsUploading(false);
            }
            return;
        }

        // STANDARD REPORTS
        // Direct to Editor with Shell Report
        let titlePrefix = '[Nuevo Reporte]';
        if (type === 'meeting_note') titlePrefix = '[Nota de Reunión]';

        const shellReport = {
            id: 'temp_' + Date.now(),
            title: `${titlePrefix} - ${currentUser?.full_name || 'Usuario'}`,
            type: type,
            // period: new Date().toISOString().slice(0, 7), // Legacy
            startDate: new Date().toISOString().slice(0, 10),
            endDate: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10), // Default +4 days
            status: 'draft',
            sections: {
                context: '',
                experimental: '',
                findings: '',
                difficulties: '',
                nextSteps: '',
                tasks: [], // New: Array of { id, text, done }
                resources: [] // New: Array of { id, title, url }
            },
            author_name: currentUser?.full_name,
            group_id: activeGroup?.id,
            created_at: new Date().toISOString()
        };
        setSelectedReport(shellReport);
        setView('detail');
    };

    const handleSaveSettings = async (settings) => {
        console.log("[DriveReports] Saving settings:", settings);
        try {
            if (updateGroupSettings && activeGroup) {
                await updateGroupSettings(activeGroup.id, settings);
                // Force reload happens via context update -> useEffect
                alert("Configuración de Drive actualizada correctamente.");
                setView('library');
            } else {
                console.error("[DriveReports] Context not ready:", { updateGroupSettings: !!updateGroupSettings, activeGroup });
                throw new Error("No se pudo guardar la configuración (Contexto no listo)");
            }
        } catch (error) {
            console.error("Error saving settings:", error);
            alert("Error al guardar configuración: " + (error.message || error.details || error));
        }
    };

    if (view === 'settings') {
        return (
            <div className="h-full bg-slate-50/50 p-4">
                <DriveReportsSettings
                    initialSettings={activeGroup?.drive_settings}
                    onSave={handleSaveSettings}
                    onCancel={() => setView('library')}
                />
            </div>
        );
    }

    if (view === 'detail' && selectedReport) {
        // CHECK: If no Drive File ID, show Editor (Draft Mode)
        // If it HAS ID, we technically shouldn't be here via list click (b/c handleSelectReport opens new tab),
        // BUT if we just generated it, we might still be here.
        if (!selectedReport.drive_file_id) {
            return (
                <div className="h-full bg-slate-50">
                    <ReportEditor
                        report={selectedReport}
                        onCancel={handleBack}
                        onGenerateSuccess={async (fileId) => {
                            // Close editor first
                            setView('library');

                            // FORCE refresh of data to ensure new fileId/link is visible in list
                            if (activeGroup?.id) {
                                // We can trigger a re-fetch via context, but for now let's rely on the fact 
                                // that updateDriveReport updates local state. 
                                // However, if the link wasn't in the payload correctly, it won't be there.
                                // The ReportEditor logic looks correct: it updates with webViewLink.
                            }
                        }}
                    />
                </div>
            );
        }

        // Fallback for viewing details of generated report inside app (if needed in future)
        // For now user wants direct external link mostly.
        return (
            <ReportDetail
                report={selectedReport}
                onBack={handleBack}
            />
        );
    }

    const handleDeleteReport = async (report) => {
        if (!window.confirm(`¿Estás seguro de eliminar el reporte "${report.title}"? Esta acción no se puede deshacer.`)) return;

        try {
            // Actually I should pull it from main hook usage
            // Wait, I need to add it to the top level destructure first
        } catch (e) {
            console.error(e);
        }
    };

    // PPT Upload Handler
    const handleUploadPPT = async (file) => {
        if (!file) return;

        try {
            // Check if folder is configured
            const folderId = activeGroup?.drive_settings?.pptFolderId;

            if (!folderId) {
                alert("No se ha configurado la carpeta para reportes PPT. Por favor ve a Configuración.");
                return;
            }

            setIsUploading(true);

            // Upload File
            // Check for token first to avoid immediate failure if possible, or just try/catch
            try {
                const uploadResult = await googleDriveService.uploadFile(file, folderId);
                await handleUploadSuccess(file, uploadResult);
            } catch (err) {
                // Check if auth error
                if (err.message && (err.message.includes('Authentication') || err.message.includes('401'))) {
                    // Try to request token
                    try {
                        await googleDriveService.requestAccessToken();
                        // Retry upload
                        const retryResult = await googleDriveService.uploadFile(file, folderId);
                        await handleUploadSuccess(file, retryResult);
                    } catch (retryErr) {
                        console.error("Retry failed:", retryErr);
                        alert("No se pudo autenticar con Google: " + retryErr.message);
                    }
                } else {
                    throw err; // Re-throw other errors
                }
            }

        } catch (error) {
            console.error("Error uploading PPT:", error);
            alert("Error al subir el archivo: " + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleUploadSuccess = async (file, uploadResult) => {
        if (uploadResult && uploadResult.id) {
            // Create DB Record
            const newReport = {
                title: file.name.replace('.pptx', '').replace('.ppt', ''),
                status: 'pending',
                type: 'ppt',
                drive_file_id: uploadResult.id,
                webViewLink: uploadResult.webViewLink,
                author_name: currentUser?.full_name,
                author_id: currentUser?.id,
                group_id: activeGroup?.id,
                created_at: new Date().toISOString(),
                submitted_at: new Date().toISOString(), // Treat as submitted immediately
                startDate: new Date().toISOString(), // Use creation date as start date for sorting
                sections: {}
            };

            await addDriveReport(newReport);
            // alert("Reporte PPT subido exitosamente.");
        }
    };

    return (
        <div className="h-full flex flex-col p-4 md:p-6 bg-slate-50/50 relative">
            {isUploading && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-[100] flex items-center justify-center">
                    <div className="bg-white p-4 rounded-xl shadow-xl flex items-center gap-3">
                        <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                        <span className="font-medium text-slate-700">Subiendo Presentación...</span>
                    </div>
                </div>
            )}
            <ReportLibrary
                onSelectReport={handleSelectReport}
                onCreateNew={handleCreateNew}
                onUploadPPT={handleUploadPPT} // Pass this handler
                onOpenSettings={canConfigure ? () => setView('settings') : null}
                onDeleteReport={async (report) => {
                    if (!window.confirm(`¿Estás seguro de eliminar el reporte "${report.title}"?`)) return;
                    try {
                        await deleteDriveReport(report.id);
                    } catch (e) {
                        alert("Error al eliminar: " + e.message);
                    }
                }}
            />
        </div>
    );
}
