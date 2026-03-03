'use client';

import { useState } from 'react';
import { Pencil, Trash2, Plus, Loader2, StickyNote } from 'lucide-react';
import { createGroupNoteAction, deleteGroupNoteAction } from '../actions';
import { toast } from 'sonner';

export function NotesWidget({ groupId, initialNotes }: { groupId: string, initialNotes: any[] }) {
    const [notes, setNotes] = useState(initialNotes);
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);

    const handleCreate = async () => {
        if (!content.trim()) return;
        setLoading(true);
        const res = await createGroupNoteAction(groupId, content.trim());
        if (res.error) {
            toast.error(res.error);
        } else {
            const newNote = {
                id: Math.random().toString(), // Temporary ID for UI
                content: content.trim(),
                created_at: new Date().toISOString(),
                creator: { full_name: 'You' } // Placeholder for immediate feedback
            };
            setNotes([newNote, ...notes]);
            setContent('');
            toast.success('Note added');
        }
        setLoading(false);
    };

    const handleDelete = async (noteId: string) => {
        const res = await deleteGroupNoteAction(noteId, groupId);
        if (res.error) {
            toast.error(res.error);
        } else {
            setNotes(notes.filter(n => n.id !== noteId));
            toast.success('Note deleted');
        }
    };

    return (
        <div className="bg-amber-50 rounded-xl border border-amber-200/60 p-5 flex flex-col h-[350px] shadow-sm">
            <div className="flex justify-between items-center mb-4 shrink-0">
                <div className="flex items-center gap-2 text-amber-900">
                    <StickyNote size={18} className="text-amber-600" />
                    <h3 className="font-semibold">Group Notes</h3>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4 scrollbar-thin scrollbar-thumb-amber-200">
                {notes.length === 0 ? (
                    <p className="text-sm text-amber-700/60 text-center italic py-4">No notes yet. Write the first one!</p>
                ) : (
                    notes.map(note => (
                        <div key={note.id} className="group relative bg-white/60 hover:bg-white rounded-lg p-3 text-sm text-amber-900 shadow-sm transition-colors border border-amber-100">
                            <p className="whitespace-pre-wrap pr-6">{note.content}</p>
                            <button
                                onClick={() => handleDelete(note.id)}
                                className="absolute right-2 top-2 p-1 text-amber-400 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                                title="Eliminar nota"
                            >
                                <Trash2 size={14} />
                            </button>
                            <p className="text-[10px] text-amber-600/60 mt-2 font-medium">
                                By {note.creator?.full_name || 'Someone'} · {new Date(note.created_at).toLocaleDateString()}
                            </p>
                        </div>
                    ))
                )}
            </div>

            <div className="shrink-0 relative">
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleCreate();
                        }
                    }}
                    placeholder="Write a quick note..."
                    className="w-full bg-white border border-amber-200 rounded-lg pr-10 pl-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 placeholder:text-amber-300 resize-none h-12"
                    rows={1}
                />
                <button
                    onClick={handleCreate}
                    disabled={loading || !content.trim()}
                    className="absolute right-2 top-2 p-1.5 text-amber-600 hover:text-amber-800 disabled:opacity-50 transition-colors bg-amber-100 hover:bg-amber-200 rounded-md"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                </button>
            </div>
        </div>
    );
}
