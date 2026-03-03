import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { motion } from 'framer-motion';

export default function PendingApproval() {
    const { logout, realUser } = useApp();

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-amber-100"
            >
                <div className="bg-amber-500 p-6 text-center">
                    <div className="mx-auto w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
                        <ShieldAlert className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Cuenta Pendiente</h1>
                    <p className="text-amber-100 mt-2">Esperando aprobación del administrador</p>
                </div>

                <div className="p-8">
                    <div className="text-center space-y-4 mb-8">
                        <p className="text-slate-600">
                            Hola <span className="font-semibold text-slate-800">{realUser?.full_name || realUser?.email}</span>,
                        </p>
                        <p className="text-slate-500 text-sm leading-relaxed">
                            Tu registro se ha completado correctamente, pero tu cuenta requiere validación por parte del administrador del sistema antes de que puedas acceder.
                        </p>
                        <div className="bg-amber-50 p-4 rounded-xl text-amber-800 text-sm border border-amber-100">
                            Recibirás una notificación cuando tu acceso haya sido habilitado y se te haya asignado un grupo de investigación.
                        </div>
                    </div>

                    <button
                        onClick={logout}
                        className="w-full bg-white border border-slate-200 text-slate-600 font-medium py-3 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                    >
                        <LogOut className="w-4 h-4" />
                        Cerrar Sesión
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
