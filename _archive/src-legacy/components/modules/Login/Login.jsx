'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { BookOpen, Lock, User, ArrowRight, AlertCircle, ShieldCheck, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

export default function Login() {
    const { login, register, requestPasswordReset } = useApp();
    const router = useRouter(); // Initialize router
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);

    // Rate Limiting State
    const [attempts, setAttempts] = useState(0);
    const [lockedUntil, setLockedUntil] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        if (isForgotPassword) {
            setIsLoading(true);
            try {
                const result = await requestPasswordReset(email);
                if (result.success) {
                    setSuccessMsg('Se ha enviado un correo para restablecer tu contraseña. Revisa tu bandeja de entrada.');
                } else {
                    setError(result.error || 'Error al enviar el correo.');
                }
            } catch (err) {
                setError('Ocurrió un error inesperado.');
            } finally {
                setIsLoading(false);
            }
            return;
        }

        // Check Lockout
        if (lockedUntil) {
            if (Date.now() < lockedUntil) {
                const secondsLeft = Math.ceil((lockedUntil - Date.now()) / 1000);
                setError(`Demasiados intentos. Inténtalo de nuevo en ${secondsLeft} segundos.`);
                return;
            } else {
                setLockedUntil(null);
                setAttempts(0);
            }
        }

        setIsLoading(true);

        try {
            if (isLogin) {
                const result = await login(email, password);

                if (result && result.success) {
                    setIsLoading(false);
                    window.location.href = '/dashboard';
                    return;
                }

                // Login failed
                const newAttempts = attempts + 1;
                setAttempts(newAttempts);
                if (newAttempts >= 5) {
                    setLockedUntil(Date.now() + 60000); // 1 minute lock
                    setError('Has excedido el número de intentos. Cuenta bloqueada temporalmente por 1 minuto.');
                } else {
                    setError(result?.error || 'Correo o contraseña incorrectos.');
                }
                setIsLoading(false);
            } else {
                // Register
                const { success, message, user } = await register({ email, password, full_name: name });

                if (success) {
                    if (user?.status === 'pending') {
                        router.push('/waiting-approval');
                        return;
                    }
                    setSuccessMsg('Registro exitoso. Iniciando sesión...');
                } else {
                    setError(message || 'Error en el registro');
                }
                setIsLoading(false);
            }
        } catch (err) {
            setError('Ocurrió un error inesperado.');
            setIsLoading(false);
        }
    };

    const toggleMode = () => {
        setIsLogin(!isLogin);
        setIsForgotPassword(false);
        setError('');
        setSuccessMsg('');
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100"
            >
                {/* Header */}
                <div className="bg-indigo-900 p-8 text-center relative overflow-hidden transition-all duration-500">
                    <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                        <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(255,255,255,0.8)_0%,transparent_60%)] animate-pulse-slow"></div>
                    </div>

                    <motion.div
                        className="relative z-10 flex justify-center mb-4"
                        animate={{ scale: isLogin ? 1 : 0.9 }}
                    >
                        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20 shadow-inner">
                            <BookOpen className="w-8 h-8 text-white" />
                        </div>
                    </motion.div>
                    <h1 className="text-2xl font-bold text-white relative z-10">PhD Nexus</h1>
                    <p className="text-indigo-200 text-sm mt-2 relative z-10">
                        {isLogin ? 'Sistema de Gestión de Doctorado' : 'Registro de Nueva Cuenta'}
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100">
                    <button
                        onClick={() => setIsLogin(true)}
                        className={`flex-1 py-4 text-sm font-medium transition-colors relative ${isLogin ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Iniciar Sesión
                        {isLogin && <motion.div layoutId="tab" className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
                    </button>
                    <button
                        onClick={() => setIsLogin(false)}
                        className={`flex-1 py-4 text-sm font-medium transition-colors relative ${!isLogin ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Registrarse
                        {!isLogin && <motion.div layoutId="tab" className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
                    </button>
                </div>

                {/* Form */}
                <div className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">

                        {isForgotPassword ? (
                            <>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Correo Electrónico</label>
                                    <div className="relative group">
                                        <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-slate-700 font-medium"
                                            placeholder="ejemplo@unizar.es"
                                            required
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full font-bold py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 text-white"
                                >
                                    {isLoading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <span>Enviar enlace de recuperación</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsForgotPassword(false); setError(''); setSuccessMsg(''); }}
                                    className="w-full text-indigo-600 hover:text-indigo-700 text-sm font-medium transition-colors"
                                >
                                    Volver al Login
                                </button>
                            </>
                        ) : (
                            <>
                                {!isLogin && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Nombre Completo</label>
                                        <div className="relative group">
                                            <User className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" />
                                            <input
                                                type="text"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-slate-700 font-medium"
                                                placeholder="Tu Nombre"
                                                required={!isLogin}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Correo Electrónico</label>
                                    <div className="relative group">
                                        <User className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-slate-700 font-medium"
                                            placeholder="ejemplo@unizar.es"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Contraseña</label>
                                        {isLogin && (
                                            <button
                                                type="button"
                                                onClick={() => { setIsForgotPassword(true); setError(''); setSuccessMsg(''); }}
                                                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                                            >
                                                ¿Olvidaste tu contraseña?
                                            </button>
                                        )}
                                    </div>
                                    <div className="relative group">
                                        <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" />
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-slate-700 font-medium"
                                            placeholder="••••••••"
                                            required
                                            minLength={6}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {error && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2"
                            >
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {error}
                            </motion.div>
                        )}

                        {successMsg && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="bg-emerald-50 text-emerald-600 text-sm p-3 rounded-lg flex items-center gap-2"
                            >
                                <ShieldCheck className="w-4 h-4 shrink-0" />
                                {successMsg}
                            </motion.div>
                        )}

                        {!isForgotPassword && (
                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`w-full font-bold py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed
                                    ${lockedUntil ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 text-white'}`}
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <span>{isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        )}
                    </form>

                    <div className="mt-8 pt-6 border-t border-gray-100">
                        {!isLogin && (
                            <p className="text-xs text-slate-400 text-center mb-4">
                                * El primer usuario registrado será el Administrador.
                                <br />Los siguientes requerirán aprobación.
                            </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-slate-400">

                            <span>v0.2.0 Auth</span>
                            <div className="flex items-center gap-1.5" title="Modo Seguro Activo">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-slate-500 font-medium">Secured</span>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            <p className="mt-8 text-slate-400 text-xs text-center max-w-xs">
                Acceso restringido a personal autorizado de la Universidad de Zaragoza.
            </p>
        </div>
    );
}
