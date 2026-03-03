import { FileText, Search } from 'lucide-react';

interface EmptyStateProps {
    type: 'no-reports' | 'no-results';
    searchQuery?: string;
}

export function EmptyState({ type, searchQuery }: EmptyStateProps) {
    if (type === 'no-reports') {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <FileText className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">No reports yet</h3>
                <p className="text-sm text-slate-500 text-center max-w-sm mb-6">
                    Get started by creating your first report, meeting note, or presentation.
                </p>
                <div className="text-xs text-slate-400">
                    Click the "New" button above to create your first document
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">No results found</h3>
            <p className="text-sm text-slate-500 text-center max-w-sm">
                {searchQuery ? (
                    <>No reports match your search for <span className="font-medium">"{searchQuery}"</span></>
                ) : (
                    'No reports match your current filters'
                )}
            </p>
            <p className="text-xs text-slate-400 mt-4">
                Try adjusting your filters or search terms
            </p>
        </div>
    );
}
