
import { Shield, Users, GraduationCap, FlaskConical, Briefcase } from 'lucide-react';

export const SYSTEM_ROLES = [
    {
        name: 'admin',
        label: 'Administrador',
        description: 'Acceso completo al sistema, gestión de usuarios y configuración',
        icon: Shield,
        color: 'text-red-600 bg-red-50'
    },
    {
        name: 'user',
        label: 'Usuario',
        description: 'Usuario estándar con acceso a grupos y funcionalidades básicas',
        icon: Users,
        color: 'text-blue-600 bg-blue-50'
    }
];

export const GROUP_ROLES = [
    {
        name: 'student',
        label: 'Estudiante',
        description: 'Estudiante de doctorado, puede crear reportes y tareas',
        icon: GraduationCap,
        color: 'text-green-600 bg-green-50',
        permissions: {
            reports: { create: true, edit_own: true, view_all: true, review: false },
            tasks: { create: true, edit: true, assign: false, view_all: true },
            knowledge: { create: true, edit_own: true, view_all: true },
            settings: { view_members: true, edit_group: false }
        }
    },
    {
        name: 'researcher',
        label: 'Investigador',
        description: 'Investigador asociado, colabora en proyectos',
        icon: FlaskConical,
        color: 'text-blue-600 bg-blue-50',
        permissions: {
            reports: { create: true, edit_own: true, view_all: true, review: false },
            tasks: { create: true, edit: true, assign: false, view_all: true },
            knowledge: { create: true, edit_own: true, view_all: true },
            settings: { view_members: true, edit_group: false }
        }
    },
    {
        name: 'supervisor',
        label: 'Supervisor',
        description: 'Supervisor de estudiantes, puede revisar reportes y asignar tareas',
        icon: FlaskConical,
        color: 'text-purple-600 bg-purple-50',
        permissions: {
            reports: { create: true, edit_own: true, view_all: true, review: true },
            tasks: { create: true, edit: true, assign: true, view_all: true },
            knowledge: { create: true, edit_own: true, view_all: true },
            settings: { view_members: true, edit_group: true }
        }
    },
    {
        name: 'labmanager',
        label: 'Lab Manager',
        description: 'Gestor de laboratorio, administra recursos y equipos',
        icon: Briefcase,
        color: 'text-orange-600 bg-orange-50',
        permissions: {
            reports: { create: true, edit_own: true, view_all: true, review: true },
            tasks: { create: true, edit: true, assign: true, view_all: true },
            knowledge: { create: true, edit_own: true, view_all: true },
            settings: { view_members: true, edit_group: true }
        }
    },
    {
        name: 'owner', // Added explicit owner role if missing
        label: 'Propietario',
        description: 'Creador del grupo, acceso total',
        icon: Shield,
        color: 'text-indigo-600 bg-indigo-50',
        permissions: {
            reports: { create: true, edit_own: true, view_all: true, review: true },
            tasks: { create: true, edit: true, assign: true, view_all: true },
            knowledge: { create: true, edit_own: true, view_all: true },
            settings: { view_members: true, edit_group: true, manage_roles: true }
        }
    }
];

export const getRolePermissions = (roleName) => {
    const role = GROUP_ROLES.find(r => r.name === roleName);
    return role ? role.permissions : null;
};
