import React, { useEffect, useState, useRef } from 'react';
import clsx from 'clsx';
import { MessageSquare, X, Trash2 } from 'lucide-react';

export default function SidenoteLayer({ comments, onDeleteComment, activeCommentId, onCommentClick }) {
    const [positions, setPositions] = useState({});
    const containerRef = useRef(null);

    // Calculate positions on mount and when comments/window change
    useEffect(() => {
        const calculatePositions = () => {
            const newPositions = {};
            const commentsArray = comments || [];

            // 1. Get ideal vertical positions based on the highlighted mark
            commentsArray.forEach(comment => {
                const markEl = document.getElementById(`annotation-${comment.id}`);
                if (markEl) {
                    const rect = markEl.getBoundingClientRect();
                    const containerRect = document.getElementById('report-document-container')?.getBoundingClientRect();

                    if (containerRect) {
                        // Relative top position within the scrollable container
                        // We need the offset relative to the *document content wrapper* usually
                        // But since SidenoteLayer is absolute/fixed, let's try to align it with the paper
                        const paperEl = document.getElementById('printable-paper');
                        if (paperEl) {
                            const paperRect = paperEl.getBoundingClientRect();
                            // Position relative to the top of the paper
                            newPositions[comment.id] = rect.top - paperRect.top;
                        }
                    }
                }
            });

            // 2. Collision Detection & Stacking (Simple)
            // Sort by top position
            const sortedIds = Object.keys(newPositions).sort((a, b) => newPositions[a] - newPositions[b]);

            let currentBottom = 0;
            const finalPositions = {};
            const CARD_HEIGHT = 150; // Approximate min height + gap

            sortedIds.forEach(id => {
                let top = newPositions[id];
                if (top < currentBottom) {
                    top = currentBottom + 10; // Push down with 10px gap
                }
                finalPositions[id] = top;
                currentBottom = top + CARD_HEIGHT; // Determine next available slot
            });

            setPositions(finalPositions);
        };

        // Run calculation with a small delay to ensure DOM is ready
        setTimeout(calculatePositions, 100);
        window.addEventListener('resize', calculatePositions);
        return () => window.removeEventListener('resize', calculatePositions);
    }, [comments]);


    return (
        <div className="absolute top-0 right-0 h-full w-[300px] pointer-events-none print:w-[30%] print:relative print:right-auto">
            <div className="relative w-full h-full">
                {comments.map(comment => (
                    <div
                        key={comment.id}
                        className={clsx(
                            "absolute left-4 w-[260px] bg-white border rounded-lg shadow-sm p-3 transition-all duration-300 pointer-events-auto cursor-pointer group",
                            activeCommentId === comment.id ? "border-indigo-500 ring-1 ring-indigo-500 z-10" : "border-gray-200 hover:border-indigo-300"
                        )}
                        style={{
                            top: positions[comment.id] || 0,
                            // If we couldn't find the position (e.g. folded section), hide it or pile at top
                            display: positions[comment.id] !== undefined ? 'block' : 'none'
                        }}
                        onClick={() => onCommentClick && onCommentClick(comment.id)}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                    {comment.author_id ? 'RJ' : 'U'}
                                </span>
                                <span className="text-xs font-bold text-slate-700">Rodrigo Jeronimo</span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-red-500">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <p className="text-sm text-slate-600 mb-2 leading-relaxed">
                            {comment.content || "Sin contenido"}
                        </p>

                        {/* Reply Input Placeholder */}
                        <div className="mt-2 pt-2 border-t border-gray-50">
                            <input
                                type="text"
                                placeholder="Escribe una respuesta..."
                                className="w-full text-xs bg-slate-50 border-none rounded p-1.5 focus:ring-1 focus:ring-indigo-500 outline-none"
                                onClick={(e) => e.stopPropagation()} // Prevent card click
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
