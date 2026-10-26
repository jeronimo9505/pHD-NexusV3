'use client';

import { useState } from 'react';
import {
    ALL_MODULES,
    GROUP_ROLES,
    ROLE_LABELS,
    DEFAULT_ROLE_PERMISSIONS,
    ConfigurableGroupRole,
    parsePermissions,
    serializePermissions,
} from '@/lib/auth/module-permissions';
import { updateGroupModulesAction } from '@/features/groups/actions';
import { toast } from 'sonner';
import {
    Home,
    FileText,
    CheckSquare,
    BookOpen,
    Settings,
    HardDrive,
    TestTube,
    CalendarDays,
    Map,
    NotebookPen,
    RotateCcw,
    Save,
    Laptop,
    Lock,
    HelpCircle,
    Loader2,
    Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MODULE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    dashboard: Home,
    logbook: NotebookPen,
    'drive-reports': FileText,
    samples: TestTube,
    tasks: CheckSquare,
    calendar: CalendarDays,
    'google-drive': HardDrive,
    knowledge: BookOpen,
    settings: Settings,
    'map-analyzer': Map,
};

interface RoleModulesConfigProps {
    groupId: string;
    initialVisibleModules?: string[] | null;
    customSaveAction?: (groupId: string, visibleModules: string[]) => Promise<{ success?: boolean; error?: string }>;
}

export function RoleModulesConfig({
    groupId,
    initialVisibleModules,
    customSaveAction,
}: RoleModulesConfigProps) {
    const [permissions, setPermissions] = useState<Record<ConfigurableGroupRole, string[]>>(() =>
        parsePermissions(initialVisibleModules)
    );
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const togglePermission = (role: ConfigurableGroupRole, moduleId: string) => {
        // Settings is locked for managers so they don't lock themselves out
        if (moduleId === 'settings' && (role === 'supervisor' || role === 'labmanager')) {
            return;
        }

        setPermissions(prev => {
            const roleMods = prev[role] || [];
            const isCurrentlyEnabled = roleMods.includes(moduleId);
            const nextMods = isCurrentlyEnabled
                ? roleMods.filter(m => m !== moduleId)
                : [...roleMods, moduleId];

            return {
                ...prev,
                [role]: nextMods,
            };
        });
        setHasUnsavedChanges(true);
    };

    const handleResetDefaults = () => {
        if (!confirm('¿Deseas restablecer la matriz de permisos a los valores recomendados por defecto?')) return;
        setPermissions(JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS)));
        setHasUnsavedChanges(true);
        toast.info('Se han restaurado los permisos recomendados. Haz clic en Guardar para aplicar.');
    };

    const handleSelectAllForRole = (role: ConfigurableGroupRole, selectAll: boolean) => {
        setPermissions(prev => {
            const nextMods = selectAll
                ? ALL_MODULES.map(m => m.id)
                : (role === 'supervisor' || role === 'labmanager' ? ['settings'] : []);

            return {
                ...prev,
                [role]: nextMods,
            };
        });
        setHasUnsavedChanges(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const serialized = serializePermissions(permissions);
            const res = customSaveAction
                ? await customSaveAction(groupId, serialized)
                : await updateGroupModulesAction(groupId, serialized);

            if (res.error) {
                toast.error(res.error);
            } else {
                toast.success('Permisos de módulos actualizados correctamente');
                setHasUnsavedChanges(false);
            }
        } catch (e: any) {
            toast.error(e?.message || 'Error al guardar los permisos');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                    <HelpCircle size={15} className="text-blue-500 flex-shrink-0" />
                    <span>
                        Marca las casillas de los módulos que deseas que cada rol pueda ver en la barra lateral.
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleResetDefaults}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Restablecer a valores recomendados"
                    >
                        <RotateCcw size={13} />
                        Restablecer recomendados
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || !hasUnsavedChanges}
                        className={cn(
                            "flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-sm",
                            hasUnsavedChanges
                                ? "bg-blue-600 hover:bg-blue-700 text-white"
                                : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        )}
                    >
                        {isSaving ? (
                            <>
                                <Loader2 size={13} className="animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            <>
                                <Save size={13} />
                                {hasUnsavedChanges ? 'Guardar Cambios' : 'Sin Cambios'}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200">
                            <th className="py-3.5 px-4 font-semibold text-slate-700 min-w-[240px]">
                                Módulo / Apartado
                            </th>
                            {GROUP_ROLES.map(role => {
                                const roleMeta = ROLE_LABELS[role];
                                const enabledCount = (permissions[role] || []).length;
                                return (
                                    <th key={role} className="py-3.5 px-3 text-center min-w-[140px]">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border", roleMeta.badgeClass)}>
                                                {roleMeta.name}
                                            </span>
                                            <div className="flex items-center gap-1 text-[11px] text-slate-400 font-normal">
                                                <span>{enabledCount}/{ALL_MODULES.length} activos</span>
                                                <span>•</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectAllForRole(role, enabledCount < ALL_MODULES.length)}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    {enabledCount < ALL_MODULES.length ? 'Todos' : 'Ninguno'}
                                                </button>
                                            </div>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {ALL_MODULES.map(module => {
                            const IconComponent = MODULE_ICONS[module.id] || BookOpen;

                            return (
                                <tr key={module.id} className="hover:bg-slate-50/60 transition-colors">
                                    {/* Module Info */}
                                    <td className="py-3.5 px-4">
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                <IconComponent size={16} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-slate-800 text-sm">
                                                        {module.label}
                                                    </span>
                                                    {module.desktopOnly && (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[10px] font-medium" title="Disponible en app de escritorio para todos los roles">
                                                            <Laptop size={11} />
                                                            Desktop
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                                                    {module.description}
                                                </p>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Role Checkboxes / Toggles */}
                                    {GROUP_ROLES.map(role => {
                                        const isEnabled = (permissions[role] || []).includes(module.id);
                                        const isLocked = module.id === 'settings' && (role === 'supervisor' || role === 'labmanager');

                                        return (
                                            <td key={role} className="py-3.5 px-3 text-center align-middle">
                                                <div className="flex items-center justify-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => togglePermission(role, module.id)}
                                                        disabled={isLocked}
                                                        className={cn(
                                                            "w-7 h-7 rounded-lg flex items-center justify-center transition-all border",
                                                            isEnabled
                                                                ? "bg-blue-600 border-blue-600 text-white shadow-sm hover:bg-blue-700"
                                                                : "bg-white border-slate-300 text-transparent hover:border-slate-400 hover:bg-slate-50",
                                                            isLocked && "opacity-60 cursor-not-allowed bg-slate-100 border-slate-300 text-slate-500"
                                                        )}
                                                        title={
                                                            isLocked
                                                                ? 'Settings siempre visible para administradores del grupo'
                                                                : isEnabled
                                                                    ? `Desactivar ${module.label} para ${role}`
                                                                    : `Activar ${module.label} para ${role}`
                                                        }
                                                    >
                                                        {isLocked ? (
                                                            <Lock size={12} className="text-slate-500" />
                                                        ) : (
                                                            <Check size={14} className={isEnabled ? "opacity-100 stroke-[3]" : "opacity-0"} />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Explanatory Footnotes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-start gap-2">
                    <Laptop size={14} className="text-purple-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <strong className="text-slate-700">Módulos de Escritorio (Desktop):</strong> Map Analyzer está diseñado para ejecutarse localmente con Python. En la versión Desktop (Tauri) está disponible para todos los roles que tengan la casilla marcada; en navegadores web se oculta automáticamente.
                    </div>
                </div>
                <div className="flex items-start gap-2">
                    <Lock size={14} className="text-slate-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <strong className="text-slate-700">Gestores del Grupo:</strong> Los Supervisores y Lab Managers tienen acceso garantizado a la pestaña de Settings para evitar bloqueos accidentales. Los Administradores del Sistema tienen acceso global a todos los módulos.
                    </div>
                </div>
            </div>
        </div>
    );
}
