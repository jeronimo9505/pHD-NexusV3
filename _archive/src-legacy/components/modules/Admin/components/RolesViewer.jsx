import React from 'react';
import { Shield, Users, GraduationCap, FlaskConical, Briefcase, Check, X } from 'lucide-react';

export default function RolesViewer() {
    // System Roles
    const systemRoles = [
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

    // Group Roles
    const groupRoles = [
        {
            name: 'student',
            label: 'Estudiante',
            description: 'Estudiante de doctorado, puede crear reportes y tareas',
            icon: GraduationCap,
            color: 'text-green-600 bg-green-50',
            permissions: {
                reports: { create: true, edit_own: true, view_all: true, review: false },
                tasks: { create: true, edit: true, assign: false, view_all: true },
                knowledge: { create: true, edit_own: true, view_all: true }
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
                knowledge: { create: true, edit_own: true, view_all: true }
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
                knowledge: { create: true, edit_own: true, view_all: true }
            }
        }
    ];

    const PermissionIcon = ({ granted }) => (
        granted ?
            <Check className="w-4 h-4 text-green-600" /> :
            <X className="w-4 h-4 text-gray-300" />
    );

    return (
        <div className="space-y-8">
            {/* System Roles Section */}
            <div>
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Shield className="w-6 h-6 text-indigo-600" />
                    Roles de Sistema
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {systemRoles.map(role => {
                        const Icon = role.icon;
                        return (
                            <div key={role.name} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-start gap-4">
                                    <div className={`p-3 rounded-lg ${role.color}`}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-slate-800 text-lg">{role.label}</h3>
                                        <p className="text-sm text-slate-600 mt-1">{role.description}</p>
                                        <div className="mt-3 pt-3 border-t border-gray-100">
                                            <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">
                                                {role.name}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Group Roles Section */}
            <div>
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Users className="w-6 h-6 text-indigo-600" />
                    Roles de Grupo
                </h2>
                <div className="grid grid-cols-1 gap-4">
                    {groupRoles.map(role => {
                        const Icon = role.icon;
                        return (
                            <div key={role.name} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                                <div className="flex items-start gap-4 mb-4">
                                    <div className={`p-3 rounded-lg ${role.color}`}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-slate-800 text-lg">{role.label}</h3>
                                        <p className="text-sm text-slate-600 mt-1">{role.description}</p>
                                        <div className="mt-2">
                                            <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">
                                                {role.name}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Permissions Matrix */}
                                <div className="mt-4 pt-4 border-t border-gray-100">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Permisos</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Reports */}
                                        <div className="bg-slate-50 rounded-lg p-3">
                                            <h5 className="text-xs font-bold text-slate-700 mb-2">Reportes</h5>
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2 text-xs">
                                                    <PermissionIcon granted={role.permissions.reports.create} />
                                                    <span className="text-slate-600">Crear</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <PermissionIcon granted={role.permissions.reports.edit_own} />
                                                    <span className="text-slate-600">Editar propios</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <PermissionIcon granted={role.permissions.reports.view_all} />
                                                    <span className="text-slate-600">Ver todos</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <PermissionIcon granted={role.permissions.reports.review} />
                                                    <span className="text-slate-600">Revisar</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Tasks */}
                                        <div className="bg-slate-50 rounded-lg p-3">
                                            <h5 className="text-xs font-bold text-slate-700 mb-2">Tareas</h5>
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2 text-xs">
                                                    <PermissionIcon granted={role.permissions.tasks.create} />
                                                    <span className="text-slate-600">Crear</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <PermissionIcon granted={role.permissions.tasks.edit} />
                                                    <span className="text-slate-600">Editar</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <PermissionIcon granted={role.permissions.tasks.assign} />
                                                    <span className="text-slate-600">Asignar</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <PermissionIcon granted={role.permissions.tasks.view_all} />
                                                    <span className="text-slate-600">Ver todas</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Knowledge */}
                                        <div className="bg-slate-50 rounded-lg p-3">
                                            <h5 className="text-xs font-bold text-slate-700 mb-2">Conocimiento</h5>
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2 text-xs">
                                                    <PermissionIcon granted={role.permissions.knowledge.create} />
                                                    <span className="text-slate-600">Crear</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <PermissionIcon granted={role.permissions.knowledge.edit_own} />
                                                    <span className="text-slate-600">Editar propios</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <PermissionIcon granted={role.permissions.knowledge.view_all} />
                                                    <span className="text-slate-600">Ver todos</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Info Note */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800">
                    <strong>Nota:</strong> En el modo de desarrollo actual, todos los permisos están habilitados para todos los usuarios.
                    Esta matriz muestra los permisos que se aplicarán cuando el sistema RBAC esté completamente implementado.
                </p>
            </div>
        </div>
    );
}
