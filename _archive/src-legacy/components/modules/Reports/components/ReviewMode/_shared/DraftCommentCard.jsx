import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, X } from 'lucide-react';

export default function DraftCommentCard({
    draftAnnotation,
    onSave,
    onCancel,
    variant = 'compact' // 'compact' | 'panel'
}) {
    const inputRef = useRef(null);
    const [value, setValue] = useState('');

    useEffect(() => {
        if (draftAnnotation && inputRef.current) inputRef.current.focus();
    }, [draftAnnotation]);

    useEffect(() => {
        // Reset draft text when quote changes
        setValue('');
    }, [draftAnnotation?.text, draftAnnotation?.quote, draftAnnotation?.sectionKey]);

    if (!draftAnnotation) return null;

    const handleSave = () => {
        const content = value.trim();
        if (!content) return;
        onSave(content);
        setValue('');
    };

    const showQuote = draftAnnotation?.text;

    if (variant === 'compact') {
        return (
            <div className="relative bg-white rounded-xl p-3 shadow-lg ring-2 ring-indigo-500/10 border border-indigo-100 animate-in slide-in-from-left-2 duration-200">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] font-bold">
                        YO
                    </div>
                    <span className="text-xs font-bold text-slate-900">Nuevo Comentario</span>
                </div>

                {showQuote && (
                    <div className="mb-2 pl-2 border-l-2 border-indigo-200 text-xs text-slate-500 italic block">
                        "{draftAnnotation.text}"
                    </div>
                )}

                <textarea
                    ref={inputRef}
                    className="w-full text-[13px] p-2.5 bg-slate-50 rounded-lg border-0 focus:ring-2 focus:ring-indigo-100 min-h-[72px] resize-none mb-2"
                    placeholder="Escribe tu comentario..."
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSave();
                        }
                        if (e.key === 'Escape') onCancel();
                    }}
                />

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!value.trim()}
                        className="px-2.5 py-1 bg-indigo-600 text-white text-[11px] font-bold rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Comentar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white p-4 rounded-xl shadow-lg border-2 border-indigo-100 ring-4 ring-indigo-50 animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-start gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                    YO
                </div>
                <div className="flex-1">
                    <span className="text-xs font-bold text-slate-900 block">Nuevo Comentario</span>
                    <span className="text-[10px] text-slate-400">{new Date().toLocaleTimeString()}</span>
                </div>
            </div>

            {showQuote && (
                <div className="mb-3 pl-2 border-l-2 border-indigo-200 text-xs text-slate-500 italic truncate">
                    "{draftAnnotation.text}"
                </div>
            )}

            <textarea
                ref={inputRef}
                className={clsx(
                    'w-full text-sm p-2 rounded-lg outline-none resize-none transition-all placeholder:text-slate-400',
                    'bg-slate-50 border border-transparent focus:bg-white focus:border-indigo-300'
                )}
                rows={3}
                placeholder="Escribe tu comentario..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSave();
                    }
                    if (e.key === 'Escape') onCancel();
                }}
            />

            <div className="flex justify-end gap-2 mt-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                    aria-label="Cancelar"
                    title="Cancelar"
                >
                    <X className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!value.trim()}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-bold shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    aria-label="Guardar"
                    title="Guardar"
                >
                    <Check className="w-3 h-3" /> Guardar
                </button>
            </div>
        </div>
    );
}
