import React, { useState } from 'react';
import { Megaphone, Send, Trash2, User, MessageCircle, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatDateShort, formatTime } from '@/utils/helpers';
import clsx from 'clsx';

export default function Announcements() {
    const { announcements, addAnnouncement, deleteAnnouncement, addAnnouncementComment, currentUser, hasRole } = useApp();
    const [isAddingAnnouncement, setIsAddingAnnouncement] = useState(false);
    const [newNote, setNewNote] = useState('');
    const [commentText, setCommentText] = useState({});
    const [expandedComments, setExpandedComments] = useState({});

    const handleSubmitAnnouncement = async (e) => {
        e.preventDefault();
        if (!newNote.trim()) return;
        await addAnnouncement(newNote);
        setNewNote('');
        setIsAddingAnnouncement(false);
    };

    const handleAddComment = async (announcementId) => {
        const text = commentText[announcementId];
        if (!text?.trim()) return;
        await addAnnouncementComment(announcementId, text);
        setCommentText(prev => ({ ...prev, [announcementId]: '' }));
    };

    const toggleComments = (id) => {
        setExpandedComments(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const isAdmin = hasRole('admin') || hasRole('labmanager') || hasRole('pi');

    return (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-4 py-2 border-b border-gray-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
                <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-amber-500" /> Anuncios
                </h3>
                {!isAddingAnnouncement && (
                    <button
                        onClick={() => setIsAddingAnnouncement(true)}
                        className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1"
                    >
                        <Plus className="w-3 h-3" /> Nuevo
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar min-h-0 bg-white">
                {/* New Announcement Form (Conditionally visible) */}
                {isAddingAnnouncement && (
                    <div className="bg-slate-50 border border-indigo-100 rounded-xl p-3 shadow-inner animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-indigo-600 uppercase">Nuevo Anuncio</span>
                            <button onClick={() => setIsAddingAnnouncement(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmitAnnouncement}>
                            <textarea
                                className="w-full text-sm p-3 bg-white border border-slate-200 rounded-lg outline-none resize-none min-h-[80px] focus:border-indigo-300 ring-2 ring-transparent focus:ring-indigo-50 transition-all"
                                placeholder="Comparte algo con el grupo..."
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                                autoFocus
                            />
                            <div className="mt-2 flex justify-end gap-2">
                                <button
                                    type="submit"
                                    disabled={!newNote.trim()}
                                    className="bg-indigo-600 text-white text-xs font-bold px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    <Send className="w-3 h-3" /> Publicar
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* List of Announcements */}
                <div className="space-y-4">
                    {announcements.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 text-sm italic">
                            No hay anuncios recientes.
                        </div>
                    ) : (
                        announcements.map(note => (
                            <div
                                key={note.id}
                                className="group relative bg-white rounded-xl border border-indigo-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
                            >
                                <div className="p-4">
                                    <p className="text-sm text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">
                                        {note.content}
                                    </p>
                                </div>

                                {/* Footer: Comments Toggle & Metadata */}
                                <div className="border-t border-indigo-100 bg-slate-50/10 p-2 px-3 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <button
                                            onClick={() => toggleComments(note.id)}
                                            className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1.5 transition-colors"
                                        >
                                            <MessageCircle className="w-3.5 h-3.5" />
                                            {note.comments_count > 0 ? `${note.comments_count} Comentarios` : 'Comentar'}
                                            {note.comments_count > 0 && (expandedComments[note.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </button>

                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] text-slate-400 italic">
                                                {formatDateShort(note.created_at)} • {formatTime(note.created_at)}
                                            </span>

                                            <div className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 flex items-center gap-1.5">
                                                <div className="w-3.5 h-3.5 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 flex-shrink-0">
                                                    <User className="w-2 h-2" />
                                                </div>
                                                <span className="text-[9px] font-bold text-slate-600 truncate max-w-[80px]">
                                                    {note.author?.full_name?.split(' ')[0] || 'Usuario'}
                                                </span>
                                            </div>

                                            {(currentUser?.id === note.author_id || isAdmin) && (
                                                <button
                                                    onClick={() => deleteAnnouncement(note.id)}
                                                    className="p-1 text-slate-300 hover:text-red-500 bg-white border border-slate-200 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Threaded Comments List */}
                                    {expandedComments[note.id] && (
                                        <div className="space-y-1 mt-3 animate-in slide-in-from-top-1 duration-200">
                                            {note.comments?.map(comment => (
                                                <div key={comment.id} className="bg-slate-50/50 border border-slate-300 p-2 rounded-xl shadow-sm flex gap-3 items-start">
                                                    <div className="w-6 h-6 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0 mt-0.5 shadow-sm">
                                                        <User className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-[10px] font-bold text-slate-700">{comment.author?.full_name?.split(' ')[0] || 'Usuario'}</span>
                                                            <span className="text-[9px] text-slate-400">{formatTime(comment.created_at)}</span>
                                                        </div>
                                                        <p className="text-sm text-slate-700 leading-normal">{comment.content}</p>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Comment Input Inside Thread */}
                                            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                                                <input
                                                    type="text"
                                                    placeholder="Escribe una respuesta..."
                                                    className="flex-1 text-[11px] bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-300 transition-all"
                                                    value={commentText[note.id] || ''}
                                                    onChange={(e) => setCommentText(prev => ({ ...prev, [note.id]: e.target.value }))}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment(note.id)}
                                                />
                                                <button
                                                    onClick={() => handleAddComment(note.id)}
                                                    disabled={!commentText[note.id]?.trim()}
                                                    className="bg-indigo-500 text-white p-1.5 rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                                                >
                                                    <Send className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </section>
    );
}
