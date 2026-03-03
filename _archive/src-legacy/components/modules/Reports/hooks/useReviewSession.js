import { useState, useCallback } from 'react';

export function useReviewSession() {
    // Selection State
    const [selection, setSelection] = useState(null); // { text, range, y, x, sectionKey }

    // UI State
    const [viewMode, setViewMode] = useState('review'); // 'review' | 'focus' | 'print'
    const [showSidenotes, setShowSidenotes] = useState(true);

    // Annotation State
    const [draftAnnotation, setDraftAnnotation] = useState(null); // { type: 'comment' | 'task', ...data }

    const clearSelection = useCallback(() => {
        setSelection(null);
        // Clear window selection
        if (window.getSelection) {
            window.getSelection().removeAllRanges();
        }
    }, []);

    const handleSelection = useCallback((event, sectionKey) => {
        const winSelection = window.getSelection();
        if (!winSelection || winSelection.rangeCount === 0) return;

        const text = winSelection.toString().trim();
        if (!text) return;

        const range = winSelection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;

        setSelection({
            text,
            sectionKey,
            range, // Keep raw range for highlighting if needed
            y: rect.top + scrollTop, // Absolute Y
            x: rect.right, // Right edge for menu
            height: rect.height
        });
    }, []);

    const startDraft = useCallback((type) => {
        if (!selection) return;
        setDraftAnnotation({
            type,
            ...selection
        });
        setSelection(null); // Clear selection UI but keep data in draft
        setShowSidenotes(true);
    }, [selection]);

    const cancelDraft = useCallback(() => {
        setDraftAnnotation(null);
    }, []);

    return {
        // State
        selection,
        viewMode,
        showSidenotes,
        draftAnnotation,

        // Actions
        setViewMode,
        setShowSidenotes,
        setSelection,
        clearSelection,
        handleSelection,
        startDraft,
        cancelDraft
    };
}
