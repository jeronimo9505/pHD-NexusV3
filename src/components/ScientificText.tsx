"use client";

import React from 'react';
import { cn } from '@/lib/utils';

interface ScientificTextProps {
    text: string;
    className?: string;
    onTagClick?: (tag: string) => void;
}

/**
 * ScientificText: A high-fidelity renderer for lab notes.
 * Supports:
 * - Basic LaTeX: $...$ with \cdot, \simeq, \text{}, \pm, etc.
 * - Subscripts: _2 or _{sub}
 * - Superscripts: ^2 or ^{super}
 * - Markdown: **bold**, *italic*, `code`
 * - Hashtags: #tag
 */
export function ScientificText({ text, className, onTagClick }: ScientificTextProps) {
    if (!text) return null;

    // 1. Pre-process common LaTeX symbols to Unicode for better rendering without KaTeX
    let processedText = text
        .replace(/\\cdot/g, '·')
        .replace(/\\simeq/g, '≃')
        .replace(/\\approx/g, '≈')
        .replace(/\\pm/g, '±')
        .replace(/\\times/g, '×')
        .replace(/\\degree/g, '°')
        .replace(/\\AA/g, 'Å')
        .replace(/\\text{([^}]*)}/g, '$1') // Remove \text{...} wrappers
        .replace(/\$([^$]*)\$/g, '$1'); // Remove $...$ wrappers for simple patterns

    // 2. Split by major formatting tokens
    // Order: Bold, Italic, Code, Sub/Sup, Hashtags
    const parts = processedText.split(/(\*\*.*?\*\*|\*.*?\*|(?:\w+)?(?:_|(?:\_{.*?}))(?:(?:\d+)|(?:{.*?}))|(?:\w+)?(?:\^|(?:\^{.*?}))(?:(?:\d+)|(?:{.*?}))|`.*?`|#[a-zA-Z0-9_áéíóúÁÉÍÓÚ]+)/g);

    return (
        <span className={cn("whitespace-pre-wrap", className)}>
            {parts.map((part, i) => {
                if (!part) return null;

                // Hashtags: #tag
                if (part.startsWith('#')) {
                    return (
                        <span 
                            key={i} 
                            onClick={(e) => { e.stopPropagation(); onTagClick?.(part); }}
                            className="inline-block px-1.5 py-0.5 mx-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-md text-[0.9em] font-bold cursor-pointer hover:bg-blue-500/20 transition-all"
                        >
                            {part}
                        </span>
                    );
                }

                // Bold: **text**
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i} className="font-black text-white">{part.slice(2, -2)}</strong>;
                }

                // Italic: *text*
                if (part.startsWith('*') && part.endsWith('*')) {
                    return <em key={i} className="italic text-white/90 font-normal">{part.slice(1, -1)}</em>;
                }

                // Code: `text`
                if (part.startsWith('`') && part.endsWith('`')) {
                    return <code key={i} className="px-1.5 py-0.5 bg-white/10 rounded font-mono text-[0.85em] text-blue-300">{part.slice(1, -1)}</code>;
                }

                // Subscript: SiO_2 or _{...}
                const subMatch = part.match(/(.*)_(?:{([^}]*)}|(\d+))/);
                if (subMatch) {
                    return (
                        <span key={i}>
                            {subMatch[1]}
                            <sub className="text-[0.75em] bottom-[-0.2em] relative opacity-80 leading-none">{subMatch[2] || subMatch[3]}</sub>
                        </span>
                    );
                }

                // Superscript: 10^6 or ^{...}
                const superMatch = part.match(/(.*)\^(?:{([^}]*)}|(\d+))/);
                if (superMatch) {
                    return (
                        <span key={i}>
                            {superMatch[1]}
                            <sup className="text-[0.75em] top-[-0.2em] relative opacity-80 leading-none">{superMatch[2] || superMatch[3]}</sup>
                        </span>
                    );
                }

                return part;
            })}
        </span>
    );
}
