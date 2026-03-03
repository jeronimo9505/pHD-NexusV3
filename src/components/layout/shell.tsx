'use client';

import { useState, createContext, useContext } from 'react';
import { cn } from '@/lib/utils';

// Context to share collapsed state with sidebar
export const SidebarContext = createContext({ collapsed: false, toggle: () => { } });
export const useSidebar = () => useContext(SidebarContext);

interface ShellProps {
    children: React.ReactNode;
    sidebar: React.ReactNode;
}

export function Shell({ children, sidebar }: ShellProps) {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed(c => !c) }}>
            <div className="flex h-screen w-full overflow-hidden bg-slate-50">
                {/* Sidebar */}
                <aside
                    className={cn(
                        "flex-shrink-0 h-full bg-slate-900 border-r border-slate-800 transition-all duration-300 ease-in-out overflow-hidden",
                        collapsed ? "w-16" : "w-64"
                    )}
                >
                    {sidebar}
                </aside>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0 h-full">
                    <main className="flex-1 overflow-hidden h-full w-full">
                        {children}
                    </main>
                </div>
            </div>
        </SidebarContext.Provider>
    );
}
