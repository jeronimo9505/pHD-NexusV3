'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import { useApp } from '@/context/AppContext';

export default function MainLayout({ children }) {
    const { isSidebarOpen, currentUser, loading } = useApp();
    const router = useRouter();

    useEffect(() => {
        if (!loading && currentUser?.status === 'pending') {
            router.push('/waiting-approval');
        }
    }, [currentUser, loading, router]);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-50">Cargando...</div>;
    }

    return (
        <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
            {isSidebarOpen && <Sidebar />}
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50/50 relative">
                {children}
            </main>
        </div>
    );
}
