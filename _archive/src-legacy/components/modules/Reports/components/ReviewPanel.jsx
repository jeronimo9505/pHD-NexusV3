import React from 'react';
import clsx from 'clsx';
import { MessageSquare, CheckSquare, Highlighter, Filter } from 'lucide-react';

export default function ReviewPanel({ activeTab, setActiveTab, comments, tasks, highlights, onCommentClick }) {

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Panel de Revisión</h3>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-medium">{comments?.length + tasks?.length + highlights?.length || 0} items</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 bg-white px-2">
                <button
                    onClick={() => setActiveTab('comments')}
                    className={clsx("flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-all",
                        activeTab === 'comments' ? "border-indigo-500 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200")}
                >
                    <MessageSquare className="w-3.5 h-3.5" /> Comentarios
                </button>
                <button
                    onClick={() => setActiveTab('tasks')}
                    className={clsx("flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-all",
                        activeTab === 'tasks' ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200")}
                >
                    <CheckSquare className="w-3.5 h-3.5" /> Tareas
                </button>
                <button
                    onClick={() => setActiveTab('highlights')}
                    className={clsx("flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-all",
                        activeTab === 'highlights' ? "border-yellow-500 text-yellow-600" : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200")}
                >
                    <Highlighter className="w-3.5 h-3.5" /> Highlights
                </button>
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {activeTab === 'comments' && (
                    comments?.length === 0 ? <div className="text-center py-10 opacity-50"><MessageSquare className="w-8 h-8 mx-auto text-slate-300 mb-2" /> <p className="text-xs text-slate-400">Sin comentarios</p></div> :
                        comments.map(c => (
                            <div key={c.id} onClick={() => onCommentClick(c.id)} className="group bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer relative">
                                <div className="absolute left-0 top-3 bottom-3 w-1 bg-indigo-500 rounded-r opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex justify-between items-start mb-2 pl-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700">
                                            {c.author ? c.author.charAt(0) : 'U'}
                                        </div>
                                        <span className="text-xs font-bold text-slate-700">{c.author}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400">{new Date(c.date).toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed pl-2">
                                    {c.text}
                                </p>
                                {/* Reply Button Placeholder */}
                                <div className="mt-2 pt-2 border-t border-gray-50 flex justify-end">
                                    <button className="text-[10px] font-bold text-indigo-400 hover:text-indigo-600">Responder</button>
                                </div>
                            </div>
                        ))
                )}

                {activeTab === 'tasks' && (
                    tasks?.length === 0 ? <div className="text-center py-10 opacity-50"><CheckSquare className="w-8 h-8 mx-auto text-slate-300 mb-2" /> <p className="text-xs text-slate-400">Sin tareas</p></div> :
                        tasks.map(t => (
                            <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex gap-3">
                                <div className="pt-0.5">
                                    <div className={clsx("w-3 h-3 rounded border flex items-center justify-center", t.status === 'done' ? "bg-emerald-500 border-emerald-500" : "border-slate-300")}>
                                        {t.status === 'done' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <p className={clsx("text-xs font-medium text-slate-800", t.status === 'done' && 'line-through text-slate-400')}>{t.title}</p>
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-[10px] text-slate-400 border border-slate-100 px-1.5 py-0.5 rounded bg-slate-50">Tarea</span>
                                        <span className="text-[10px] text-slate-400">{new Date(t.due_date).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                )}

                {activeTab === 'highlights' && (
                    highlights?.length === 0 ? <div className="text-center py-10 opacity-50"><Highlighter className="w-8 h-8 mx-auto text-slate-300 mb-2" /> <p className="text-xs text-slate-400">Sin resaltados</p></div> :
                        highlights.map(h => (
                            <div key={h.id} className="bg-yellow-50/50 border border-yellow-100 rounded-xl p-3 hover:border-yellow-300 transition-colors">
                                <div className="flex items-start gap-2">
                                    <Highlighter className="w-3 h-3 text-yellow-500 mt-0.5 shrink-0" />
                                    <p className="text-xs font-serif text-slate-800 italic leading-relaxed">"{h.quote}"</p>
                                </div>
                            </div>
                        ))
                )}
            </div>
        </div>
    );
}
