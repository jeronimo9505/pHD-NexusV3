'use client';

import { useState } from 'react';
import { X, Plus, Link2, StickyNote, FileText } from 'lucide-react';
import { createKnowledgeItemAction } from '../actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface CreateResourceDialogProps {
    groupId: string;
    folders: string[];
    onClose: () => void;
}

type ResourceType = 'link' | 'note' | 'file';

const types: { value: ResourceType; label: string; icon: any; desc: string }[] = [
    { value: 'link', label: 'Link', icon: Link2, desc: 'Web URL or external resource' },
    { value: 'note', label: 'Note', icon: StickyNote, desc: 'Text note or reference' },
    { value: 'file', label: 'File Ref', icon: FileText, desc: 'Reference to a document' },
];

export function CreateResourceDialog({ groupId, folders, onClose }: CreateResourceDialogProps) {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [resourceType, setResourceType] = useState<ResourceType>('link');
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [category, setCategory] = useState('');
    const [newFolder, setNewFolder] = useState('');
    const [description, setDescription] = useState('');
    const [tags, setTags] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            toast.error('Title is required');
            return;
        }

        setSaving(true);
        const folder = newFolder.trim() || category || 'General';

        const result = await createKnowledgeItemAction({
            group_id: groupId,
            title: title.trim(),
            url: url.trim() || undefined,
            category: folder,
            description: description.trim(),
            tags: tags.split(',').map(t => t.trim()).filter(Boolean),
            resource_type: resourceType,
        });

        setSaving(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('Resource created');
            router.refresh();
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Plus size={18} className="text-indigo-600" /> New Resource
                    </h2>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Resource Type */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Type</label>
                        <div className="grid grid-cols-3 gap-2">
                            {types.map(t => (
                                <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => setResourceType(t.value)}
                                    className={cn(
                                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center",
                                        resourceType === t.value
                                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                            : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                                    )}
                                >
                                    <t.icon size={20} />
                                    <span className="text-xs font-semibold">{t.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Title *</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Research Protocol v2"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            required
                        />
                    </div>

                    {/* URL */}
                    {(resourceType === 'link' || resourceType === 'file') && (
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">URL</label>
                            <input
                                type="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>
                    )}

                    {/* Folder */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Folder</label>
                        <div className="flex gap-2">
                            <select
                                value={category}
                                onChange={(e) => { setCategory(e.target.value); setNewFolder(''); }}
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 bg-white"
                            >
                                <option value="">Select folder...</option>
                                {folders.map(f => (
                                    <option key={f} value={f}>{f}</option>
                                ))}
                            </select>
                            <span className="text-xs text-slate-400 self-center">or</span>
                            <input
                                type="text"
                                value={newFolder}
                                onChange={(e) => { setNewFolder(e.target.value); setCategory(''); }}
                                placeholder="New folder"
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description..."
                            rows={3}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
                        />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Tags <span className="font-normal text-slate-400">(comma separated)</span></label>
                        <input
                            type="text"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            placeholder="e.g. graphene, protocol, synthesis"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Creating...' : 'Create Resource'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
