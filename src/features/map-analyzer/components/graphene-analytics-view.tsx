'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchGrapheneAnalytics } from '@/lib/desktop';
import { RefreshCw, Download, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface GrapheneAnalyticsProps {
    vaultRoot: string;
    h5Path: string;
    applySnv?: boolean;
}

export function GrapheneAnalyticsView({ vaultRoot, h5Path, applySnv = false }: GrapheneAnalyticsProps) {
    const [b64Image, setB64Image] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const loadAnalytics = useCallback(async () => {
        if (!vaultRoot || !h5Path) return;
        setLoading(true);
        setB64Image(null);
        try {
            const res = await fetchGrapheneAnalytics({
                vault_root: vaultRoot,
                h5_relative_path: h5Path,
                apply_snv: applySnv,
            });
            if (res.success && res.composite_base64) {
                setB64Image(res.composite_base64);
            }
        } catch (err: any) {
            toast.error(err.message || 'Failed to analyze graphene dataset');
        } finally {
            setLoading(false);
        }
    }, [vaultRoot, h5Path, applySnv]);

    useEffect(() => {
        loadAnalytics();
    }, [loadAnalytics]);

    const handleDownload = () => {
        if (!b64Image) return;
        const a = document.createElement('a');
        a.href = `data:image/png;base64,${b64Image}`;
        a.download = `graphene_analytics_${h5Path.split('/').pop()?.replace('.h5', '.png')}`;
        a.click();
    };

    if (loading) {
        return (
            <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-slate-50/50 backdrop-blur-sm z-30 gap-4">
                <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
                    <div className="text-slate-900 font-extrabold text-sm tracking-tight">Computing Deep Analytics...</div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Generating Quad, FWHM & Hexbin</p>
                </div>
            </div>
        );
    }

    if (!loading && !b64Image) {
        return (
            <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-white text-slate-400 gap-3">
                <AlertCircle className="w-12 h-12 opacity-20" />
                <div className="text-xs font-bold uppercase tracking-widest">
                    No analytics available
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 w-full h-full relative flex items-center justify-center overflow-hidden bg-slate-900/50">
            {b64Image && (
                <div className="absolute top-4 right-4 z-20">
                    <button
                        onClick={handleDownload}
                        className="bg-slate-800/80 backdrop-blur-md border border-slate-700 hover:border-indigo-500 hover:bg-slate-800 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-xl transition-all flex items-center gap-2"
                    >
                        <Download size={16} /> Export HQ Report
                    </button>
                </div>
            )}
            
            {b64Image && (
                <div className="w-full h-full flex items-center justify-center p-4 xl:p-8">
                    <img 
                        src={`data:image/png;base64,${b64Image}`} 
                        alt="Graphene Analytics Composite" 
                        className="w-full h-full object-contain pointer-events-none rounded-xl"
                        style={{ filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.4))" }}
                    />
                </div>
            )}
        </div>
    );
}
