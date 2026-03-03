import React, { useRef, useEffect } from 'react';
import { getWeekLabel } from '../../../utils/helpers';
import clsx from 'clsx';
import { FileText, Calendar, User, Users, CheckSquare } from 'lucide-react';

export default function ReportDocument({ reportMeta, sections, annotations, linkedTasks, linkedResources, onSelection, activeSelection }) {

    const SECTION_TITLES = {
        context: 'Contexto / Objetivo',
        experimental: 'Trabajo Experimental',
        findings: 'Hallazgos Principales',
        difficulties: 'Dificultades y Retos',
        nextSteps: 'Próximos Pasos'
    };

    // --- 1. Selection Handler (Robust Anchoring) ---
    const handleMouseUp = (e, key) => {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        const container = e.currentTarget;

        if (!container.contains(range.commonAncestorContainer)) return;

        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(container);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        const startOffset = preCaretRange.toString().length;

        const quote = selection.toString();
        const endOffset = startOffset + quote.length;

        const fullText = container.textContent;
        const prefix = fullText.substring(Math.max(0, startOffset - 50), startOffset);
        const suffix = fullText.substring(endOffset, Math.min(fullText.length, endOffset + 50));

        onSelection({
            quote: quote,
            sectionKey: key,
            rangeStart: startOffset,
            rangeEnd: endOffset,
            prefix: prefix,
            suffix: suffix,
            x: e.clientX,
            y: e.clientY
        });
    };

    // --- 2. Rendering Logic (Linkify + Annotations) ---
    const renderSectionContent = (key, content) => {
        // Only show placeholder if truly absolutely empty, otherwise even empty sections in Word exist as space.
        // But for structure we keep it.
        const sectionAnnotations = annotations ? annotations.filter(a => a.section_key === key) : [];
        const lines = content ? content.split('\n') : [];

        if (lines.length === 0) return <p className="text-slate-300 italic font-serif">Sin contenido...</p>;

        return (
            <div
                className="font-serif text-[17px] leading-[1.8] text-slate-800 text-justify relative outline-none"
                data-section-key={key}
                onMouseUp={(e) => handleMouseUp(e, key)}
                style={{ fontFamily: '"Merriweather", "Georgia", serif' }} // Word-like serif font
            >
                {lines.map((line, i) => (
                    <div key={i} className="min-h-[1.5em] mb-4">
                        {renderLine(line, i, sectionAnnotations, lines)}
                    </div>
                ))}
            </div>
        );
    };

    const renderLine = (lineText, lineIndex, annotations, allLines) => {
        let globalOffset = 0;
        for (let i = 0; i < lineIndex; i++) {
            globalOffset += allLines[i].length + 1;
        }

        const lineStart = globalOffset;
        const lineEnd = lineStart + lineText.length;

        const relevantAnnotations = annotations.filter(a =>
            (a.range_start < lineEnd && a.range_end > lineStart)
        );

        relevantAnnotations.sort((a, b) => a.range_start - b.range_start);

        const elements = [];
        const localLineText = lineText;

        if (relevantAnnotations.length === 0) {
            return linkify(localLineText);
        }

        let localCursor = 0;

        relevantAnnotations.forEach(ann => {
            const annStartInLine = Math.max(0, ann.range_start - lineStart);
            const annEndInLine = Math.min(localLineText.length, ann.range_end - lineStart);

            if (annStartInLine > localCursor) {
                elements.push(linkify(localLineText.substring(localCursor, annStartInLine)));
            }

            const annText = localLineText.substring(annStartInLine, annEndInLine);
            elements.push(
                <mark
                    key={ann.id}
                    id={`annotation-${ann.id}`}
                    className={clsx(
                        "cursor-pointer px-0 py-0.5 transition-colors border-b-2",
                        ann.type === 'highlight' ? "bg-yellow-200/50 border-yellow-400 text-slate-900" :
                            ann.type === 'comment' ? "bg-indigo-100/50 border-indigo-500 hover:bg-indigo-200/50" :
                                "bg-emerald-100/50 border-emerald-500"
                    )}
                    title={`${ann.type}: ${ann.quote}`}
                >
                    {annText}
                </mark>
            );

            localCursor = annEndInLine;
        });

        if (localCursor < localLineText.length) {
            elements.push(linkify(localLineText.substring(localCursor)));
        }

        return <>{elements}</>;
    };

    const linkify = (text) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlRegex);

        return parts.map((part, i) => {
            if (part.match(urlRegex)) {
                return (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800 break-words cursor-pointer" onClick={e => e.stopPropagation()}>
                        {part}
                    </a>
                );
            }
            return part;
        });
    };

    return (
        <article className="space-y-10 animate-in fade-in duration-500">
            {/* Minimal Header (Word style) */}
            <div className="mb-12 border-b-2 border-slate-800 pb-6">
                <h1 className="text-4xl font-bold text-slate-900 font-serif mb-4 leading-tight">
                    {reportMeta.authorName ? `${reportMeta.authorName}'s Report` : 'Scientific Report'}
                </h1>
                <div className="flex justify-between items-end text-sm font-sans text-slate-500">
                    <div className="space-y-1">
                        <p><span className="font-bold text-slate-700">Author:</span> {reportMeta.authorName}</p>
                        <p><span className="font-bold text-slate-700">Period:</span> {new Date(reportMeta.startDate).toLocaleDateString()} — {new Date(reportMeta.endDate).toLocaleDateString()}</p>
                    </div>
                    <span className="bg-slate-100 px-3 py-1 rounded text-slate-600 font-bold uppercase tracking-wider text-xs">
                        {reportMeta.status}
                    </span>
                </div>
            </div>

            {/* Sections */}
            {Object.entries(SECTION_TITLES).map(([key, title]) => (
                <section key={key} className="relative group scroll-mt-32">
                    {/* Floating Heading like Word Navigation or simple bold heading */}
                    <h2 className="text-xl font-bold text-slate-800 mb-4 font-sans uppercase tracking-tight">
                        {title}
                    </h2>
                    <div className="mb-8">
                        {renderSectionContent(key, sections[key])}
                    </div>
                </section>
            ))}

            {/* Linked Resources & Tasks Section */}
            {((linkedTasks && linkedTasks.length > 0) || (linkedResources && linkedResources.length > 0)) && (
                <section className="mt-12 border-t border-slate-200 pt-8 break-inside-avoid">
                    <h2 className="text-xl font-bold text-slate-800 mb-6 font-sans uppercase tracking-tight flex items-center gap-2">
                        <FileText className="w-5 h-5 text-slate-500" />
                        Recursos y Tareas
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Tasks Column */}
                        {linkedTasks && linkedTasks.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider flex items-center gap-2">
                                    <CheckSquare className="w-4 h-4" /> Tareas Vinculadas
                                </h3>
                                <ul className="space-y-2">
                                    {linkedTasks.map(task => (
                                        <li key={task.id} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-indigo-300 transition-colors">
                                            <div className="font-medium text-slate-800 text-sm">{task.title}</div>
                                            {task.status && (
                                                <span className={clsx(
                                                    "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase mt-1 inline-block",
                                                    task.status === 'done' ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-700"
                                                )}>
                                                    {task.status}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Resources Column */}
                        {linkedResources && linkedResources.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider flex items-center gap-2">
                                    <FileText className="w-4 h-4" /> Recursos Vinculados
                                </h3>
                                <ul className="space-y-2">
                                    {linkedResources.map(res => (
                                        <li key={res.id} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-blue-300 transition-colors group cursor-pointer" onClick={() => window.open(res.url, '_blank')}>
                                            <div className="font-medium text-slate-800 text-sm group-hover:text-blue-600 truncate transition-colors">{res.title}</div>
                                            <div className="text-xs text-slate-400 mt-0.5 truncate">{res.url}</div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </section>
            )}
        </article>
    );
}
