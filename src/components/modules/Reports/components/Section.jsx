import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import clsx from 'clsx';

export default function Section({ title, icon, children, comments, onAddComment, userRole, sectionKey }) {
    const [isAddingComment, setIsAddingComment] = useState(false);
    const [commentText, setCommentText] = useState("");

    const handleSave = () => {
        if (commentText.trim()) {
            onAddComment(sectionKey, commentText);
            setCommentText("");
            setIsAddingComment(false);
        }
    };

    return (
        <section className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 transition-all hover:shadow-md group relative">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-50">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-slate-50 rounded-lg">{icon}</div>
                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">{title}</h3>
                </div>

                <button
                    onClick={() => setIsAddingComment(!isAddingComment)}
                    className="text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 p-1 rounded transition-all opacity-0 group-hover:opacity-100"
                    title="Agregar comentario"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {children}

            {isAddingComment && (
                <div className="mt-4 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 animate-in slide-in-from-top-2 fade-in">
                    <textarea
                        className="w-full text-xs p-2 border border-indigo-200 rounded bg-white outline-none focus:ring-1 focus:ring-indigo-400 resize-none text-slate-700"
                        rows={2}
                        placeholder="Observación..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        autoFocus
                    />
                    <div className="flex justify-end gap-2 mt-2">
                        <button onClick={() => setIsAddingComment(false)} className="text-[10px] px-2 py-1 text-slate-500">Cancelar</button>
                        <button onClick={handleSave} className="text-[10px] px-3 py-1 bg-indigo-600 text-white rounded font-bold shadow-sm">Guardar</button>
                    </div>
                </div>
            )}

            {comments && comments.length > 0 && (
                <div className="mt-4 space-y-3 pt-3 border-t border-gray-50">
                    {comments.map(comment => (
                        <div key={comment.id} className="relative pl-3 border-l-2 border-indigo-300">
                            <p className="text-xs text-slate-700 italic mb-1 leading-relaxed">"{comment.text}"</p>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-indigo-900">{comment.author}</span>
                                <span className="text-[9px] text-slate-400">{new Date(comment.date).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
