'use client';

import { Bell, User } from 'lucide-react';

export function Navbar() {
    return (
        <header className="h-16 bg-white border-b flex items-center justify-between px-6 sticky top-0 z-40">
            <div /* Breadcrumbs placeholder */ />

            <div className="flex items-center gap-4">
                <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors relative">
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                    <Bell size={20} />
                </button>
                <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
                    <User size={18} />
                </div>
            </div>
        </header>
    );
}
