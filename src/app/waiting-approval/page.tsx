'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Clock, CheckCircle, ArrowLeft, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';

export default function WaitingApproval() {
    const router = useRouter();
    const { logout } = useApp();

    const handleLogout = async () => {
        await logout();
        router.push('/login');
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100"
            >
                <div className="bg-amber-50 p-8 text-center border-b border-amber-100">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring" }}
                        className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-sm"
                    >
                        <Clock className="w-10 h-10 text-amber-600" />
                    </motion.div>
                    <h1 className="text-2xl font-bold text-gray-800">Cuenta Pendiente</h1>
                    <p className="text-amber-700 mt-2 font-medium">Revisión en proceso</p>
                </div>

                <div className="p-8 space-y-6">
                    <div className="space-y-4">
                        <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <h3 className="font-semibold text-slate-700">Registro Exitoso</h3>
                                <p className="text-sm text-slate-500 leading-relaxed">
                                    Hemos recibido tu solicitud de registro correcamente.
                                </p>
                            </div>
                        </div>

                        <p className="text-slate-600 text-center leading-relaxed">
                            Por razones de seguridad, un <strong>Administrador</strong> debe aprobar tu cuenta antes de que puedas acceder al sistema.
                        </p>

                        <div className="bg-indigo-50 text-indigo-800 text-xs p-3 rounded-lg text-center font-medium">
                            Recibirás una notificación cuando tu acceso sea habilitado.
                        </div>
                    </div>

                    <div className="pt-4 flex flex-col gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-3 px-4 bg-white border-2 border-slate-200 text-slate-600 font-bold rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                        >
                            Comprobar Estado
                        </button>

                        <button
                            onClick={handleLogout}
                            className="w-full py-3 px-4 bg-transparent text-slate-400 font-medium rounded-xl hover:text-slate-600 transition-colors flex items-center justify-center gap-2"
                        >
                            <LogOut className="w-4 h-4" />
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
