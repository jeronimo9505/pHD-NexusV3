'use client';

import { useState } from 'react';
import { ResourceCard } from './resource-card';
import { KnowledgeItem } from '../actions';
import { Search } from 'lucide-react';

interface KnowledgeListProps {
    initialItems: KnowledgeItem[];
}

export function KnowledgeList({ initialItems }: KnowledgeListProps) {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');

    // Client-side filtering for simplicity (or use server actions for scale)
    const filteredItems = initialItems.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = category === 'all' || item.category === category;
        return matchesSearch && matchesCategory;
    });

    const categories = Array.from(new Set(initialItems.map(i => i.category).filter(Boolean)));

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="Search resources..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
                    <button
                        onClick={() => setCategory('all')}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${category === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                        All
                    </button>
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setCategory(cat!)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${category === cat ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredItems.map(item => (
                    <ResourceCard key={item.id || item.drive_file_id} item={item} />
                ))}
            </div>

            {filteredItems.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                    No resources found matching your filters.
                </div>
            )}
        </div>
    );
}
