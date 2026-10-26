import { GroupRole } from "./roles";

export interface NavModule {
    id: string;
    label: string;
    description: string;
    desktopOnly?: boolean;
    alwaysVisibleToManagers?: boolean;
}

export const ALL_MODULES: NavModule[] = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        description: 'Visión general del grupo, notas, reuniones y métricas',
    },
    {
        id: 'logbook',
        label: 'Logbook',
        description: 'Cuaderno de laboratorio personal y notas rápidas',
    },
    {
        id: 'drive-reports',
        label: 'Drive Reports',
        description: 'Informes semanales sincronizados con Google Drive',
    },
    {
        id: 'samples',
        label: 'Samples',
        description: 'Gestión y árbol genealógico de muestras de laboratorio',
    },
    {
        id: 'tasks',
        label: 'Tasks',
        description: 'Tablero Kanban de tareas y seguimiento de objetivos',
    },
    {
        id: 'calendar',
        label: 'Calendar',
        description: 'Calendario de eventos, reuniones y fechas de entrega',
    },
    {
        id: 'google-drive',
        label: 'Google Drive',
        description: 'Explorador y almacenamiento compartido en Google Drive',
    },
    {
        id: 'knowledge',
        label: 'Knowledge Base',
        description: 'Base de conocimiento, documentación y protocolos',
    },
    {
        id: 'settings',
        label: 'Settings',
        description: 'Configuración del grupo, miembros e integraciones',
        alwaysVisibleToManagers: true,
    },
    {
        id: 'map-analyzer',
        label: 'Map Analyzer',
        description: 'Análisis de mapas espectrales y procesamiento científico',
        desktopOnly: true,
    },
];

export const GROUP_ROLES = ['student', 'researcher', 'supervisor', 'labmanager'] as const;
export type ConfigurableGroupRole = typeof GROUP_ROLES[number];

export const ROLE_LABELS: Record<ConfigurableGroupRole, { name: string; description: string; badgeClass: string }> = {
    student: {
        name: 'Estudiante (Student)',
        description: 'Miembros en formación o tesistas',
        badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    },
    researcher: {
        name: 'Investigador (Researcher)',
        description: 'Investigadores y científicos del laboratorio',
        badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
    },
    supervisor: {
        name: 'Supervisor',
        description: 'Directores de proyecto y coordinadores',
        badgeClass: 'bg-violet-100 text-violet-700 border-violet-200',
    },
    labmanager: {
        name: 'Lab Manager',
        description: 'Gestores técnicos y administradores de laboratorio',
        badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
    },
};

/**
 * Matriz por defecto de módulos visibles según el rol del miembro.
 * Se aplica automáticamente si el grupo no tiene una configuración personalizada en la base de datos.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<ConfigurableGroupRole, string[]> = {
    student: [
        'dashboard',
        'logbook',
        'drive-reports',
        'samples',
        'tasks',
        'calendar',
        'knowledge',
        'map-analyzer', // Disponible en app desktop para todos los roles
    ],
    researcher: [
        'dashboard',
        'logbook',
        'drive-reports',
        'samples',
        'tasks',
        'calendar',
        'google-drive',
        'knowledge',
        'map-analyzer',
    ],
    supervisor: [
        'dashboard',
        'logbook',
        'drive-reports',
        'samples',
        'tasks',
        'calendar',
        'google-drive',
        'knowledge',
        'settings',
        'map-analyzer',
    ],
    labmanager: [
        'dashboard',
        'logbook',
        'drive-reports',
        'samples',
        'tasks',
        'calendar',
        'google-drive',
        'knowledge',
        'settings',
        'map-analyzer',
    ],
};

/**
 * Convierte la matriz { student: [...], researcher: [...] } en un array plano de strings para la BD:
 * ['student:dashboard', 'student:logbook', ...]
 */
export function serializePermissions(matrix: Record<ConfigurableGroupRole, string[]>): string[] {
    const result: string[] = [];
    for (const role of GROUP_ROLES) {
        const modules = matrix[role] || [];
        for (const mod of modules) {
            result.push(`${role}:${mod}`);
        }
    }
    return result;
}

/**
 * Parsea el array visible_modules almacenado en la BD a la estructura por rol.
 * Si es null o vacío, retorna los valores por defecto recomendados.
 */
export function parsePermissions(visibleModules?: string[] | null): Record<ConfigurableGroupRole, string[]> {
    if (!visibleModules || !Array.isArray(visibleModules) || visibleModules.length === 0) {
        return JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
    }

    const hasRolePrefixes = visibleModules.some(item => item.includes(':'));

    if (hasRolePrefixes) {
        const matrix: Record<ConfigurableGroupRole, string[]> = {
            student: [],
            researcher: [],
            supervisor: [],
            labmanager: [],
        };

        for (const entry of visibleModules) {
            const [role, moduleId] = entry.split(':');
            if (role && moduleId && (GROUP_ROLES as readonly string[]).includes(role)) {
                const confRole = role as ConfigurableGroupRole;
                if (!matrix[confRole].includes(moduleId)) {
                    matrix[confRole].push(moduleId);
                }
            }
        }

        // Asegurar que Settings siempre esté para supervisores y labmanagers
        if (!matrix.supervisor.includes('settings')) matrix.supervisor.push('settings');
        if (!matrix.labmanager.includes('settings')) matrix.labmanager.push('settings');

        // Asegurar que map-analyzer esté presente para todos en desktop
        for (const role of GROUP_ROLES) {
            if (!matrix[role].includes('map-analyzer')) {
                matrix[role].push('map-analyzer');
            }
        }

        return matrix;
    } else {
        // Formato legado plano (ej: ['samples', 'map-analyzer'])
        // Si el admin guardó una lista plana de módulos permitidos en el grupo,
        // la combinamos con los permisos por defecto de cada rol.
        const matrix: Record<ConfigurableGroupRole, string[]> = {
            student: [],
            researcher: [],
            supervisor: [],
            labmanager: [],
        };

        for (const role of GROUP_ROLES) {
            const defaults = DEFAULT_ROLE_PERMISSIONS[role];
            matrix[role] = defaults.filter(m => visibleModules.includes(m));
            // Asegurar map-analyzer en desktop
            if (!matrix[role].includes('map-analyzer')) {
                matrix[role].push('map-analyzer');
            }
        }

        if (!matrix.supervisor.includes('settings')) matrix.supervisor.push('settings');
        if (!matrix.labmanager.includes('settings')) matrix.labmanager.push('settings');

        return matrix;
    }
}

/**
 * Comprueba si un módulo específico debe mostrarse a un usuario.
 */
export function isModuleAllowed({
    moduleId,
    role,
    isOwner = false,
    isSysAdmin = false,
    isDesktopClient = false,
    visibleModules,
}: {
    moduleId: string;
    role: GroupRole | string | null | undefined;
    isOwner?: boolean;
    isSysAdmin?: boolean;
    isDesktopClient?: boolean;
    visibleModules?: string[] | null;
}): boolean {
    const isManager = isOwner || role === 'supervisor' || role === 'labmanager' || role === 'owner';

    // 1. Módulos exclusivos de Desktop (ej: map-analyzer)
    if (moduleId === 'map-analyzer') {
        // En web, NUNCA se muestra porque no existe el runtime local de python/archivos
        if (!isDesktopClient) {
            return false;
        }
        // En desktop, el usuario solicitó explícitamente:
        // "ademàs de que hay módulos que solo estàn disponibles para desktop, esto dejar que todo los roles puedan ver."
        return true;
    }

    // 2. Administradores de sistema ven todo en web
    if (isSysAdmin) {
        return true;
    }

    // 3. Settings siempre es visible para gestores del grupo para evitar bloqueos
    if (moduleId === 'settings' && isManager) {
        return true;
    }

    // 4. Obtener matriz de permisos (personalizada o por defecto)
    const permissionsMatrix = parsePermissions(visibleModules);
    const effectiveRole = ((role || 'student').toLowerCase()) as ConfigurableGroupRole;

    const allowedForRole = permissionsMatrix[effectiveRole] || permissionsMatrix.student;

    if (isManager && !allowedForRole) {
        return true;
    }

    return allowedForRole ? allowedForRole.includes(moduleId) : false;
}
