import React from 'react';
import { MessageSquare, CheckSquare, Highlighter } from 'lucide-react';

export default function FloatingToolbar({ selection, onComment, onTask, onHighlight }) {
    if (!selection) return null;

    // Position logic: always on the right side of the paper, aligned with Y
    // Paper is centered. 50% + 430px is the right edge.
    // But we want it relative to the viewport OR relative to the selection if we wanted it right above.
    // The design choice: "Google Docs style" -> Bubble physically near the right margin.

    // We used absolute/fixed mix in previous attempts.
    // Since useReviewSession calculates Y relative to document scrollTop, we can use absolute if wrapper is relative.
    // Or fixed if we subtract scroll. Let's use Fixed for stability.

    // selection.y is CLIENT/SCREEN Y? No, getBoundingClientRect is Viewport.
    // useReviewSession added scrollY. So selection.y is ABSOLUTE DOCUMENT Y.
    // If we use Fixed, we need Viewport Y: selection.y - scrollTop.
    // Let's assume selection.y passed in IS appropriate for the style strategy.

    // Let's stick to the "Right Edge of Paper" strategy:
    // left: calc(50% + 435px)
    // top: selection.y (Absolute) -> requires position: absolute in a relative container

    // selection.y comes from useReviewSession as absolute document Y.
    // We render the toolbar as fixed, so we convert it to viewport Y.
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const top = (typeof selection.y === 'number' ? selection.y - scrollTop : 0) - 10;

    return (
        <div
            className="fixed z-50 animate-in fade-in zoom-in-95 duration-150 ease-out"
            style={{
                top,
                left: 'calc(50% + 435px)'
            }}
            role="toolbar"
            aria-label="Acciones de revisión"
        >
            <div className="bg-white shadow-xl border border-indigo-50 rounded-full p-1.5 flex items-center gap-1">
                <button
                    onClick={(e) => { e.stopPropagation(); onComment(); }}
                    className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-all shadow-md active:scale-95 group"
                    title="Añadir comentario (C)"
                    aria-label="Añadir comentario"
                >
                    <MessageSquare className="w-4 h-4" />
                </button>

                <div className="w-px h-5 bg-gray-100 mx-0.5" />

                <button
                    onClick={(e) => { e.stopPropagation(); onTask(); }}
                    className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full transition-all shadow-md active:scale-95"
                    title="Crear Tarea (T)"
                    aria-label="Crear tarea"
                >
                    <CheckSquare className="w-4 h-4" />
                </button>

                <div className="w-px h-5 bg-gray-100 mx-0.5" />

                <button
                    onClick={(e) => { e.stopPropagation(); onHighlight(); }}
                    className="p-2 hover:bg-yellow-50 text-amber-500 hover:text-amber-600 rounded-full transition-all"
                    title="Resaltar (H)"
                    aria-label="Resaltar"
                >
                    <Highlighter className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
