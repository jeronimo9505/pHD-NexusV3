import React, { useMemo } from 'react';
import clsx from 'clsx';
import { FlaskConical, Target, Lightbulb, AlertTriangle } from 'lucide-react';

// Section Icons Map
const SECTION_ICONS = {
    context: Target,
    experimental: FlaskConical,
    findings: Lightbulb,
    difficulties: AlertTriangle,
    nextSteps: Target
};

const SECTION_LABELS = {
    context: "Contexto / Objetivo",
    experimental: "Trabajo Experimental",
    findings: "Hallazgos Principales",
    difficulties: "Dificultades y Retos",
    nextSteps: "Próximos Pasos"
};

export default function ReportPaper({
    sections,
    reportMeta,
    completedTasks,
    onSelection,
    annotations,
    activeAnnotationId,
    onAnnotationHover
}) {
    // This component renders the "paper" for review mode.
    // Contract expectations (from useReportDetails + useReviewSession):
    // - annotations: report_annotations enriched with { id, type, section_key, quote, range_start, range_end, author, content/text }
    // - onSelection(event, sectionKey): selection handler owned by useReviewSession

    const sectionKeys = ['context', 'experimental', 'findings', 'difficulties', 'nextSteps'];

    const handleMouseUp = (e, key) => onSelection(e, key);

    const safeDate = (value) => {
        const d = value ? new Date(value) : null;
        return d && !Number.isNaN(d.getTime()) ? d : null;
    };

    const formatShortDate = (value) => {
        const d = safeDate(value);
        return d ? d.toLocaleDateString() : '—';
    };

    const normalizeAnnotation = (a) => {
        const rangeStart = typeof a.range_start === 'number' ? a.range_start : null;
        const rangeEnd = typeof a.range_end === 'number' ? a.range_end : null;
        const hasRange = rangeStart !== null && rangeEnd !== null && rangeEnd > rangeStart;

        return {
            ...a,
            type: a.type || 'highlight',
            quote: typeof a.quote === 'string' ? a.quote : '',
            range_start: hasRange ? rangeStart : null,
            range_end: hasRange ? rangeEnd : null
        };
    };

    const annotationsBySection = useMemo(() => {
        const bySection = new Map();
        (annotations || []).map(normalizeAnnotation).forEach((a) => {
            const key = a.section_key;
            if (!key) return;
            if (!bySection.has(key)) bySection.set(key, []);
            bySection.get(key).push(a);
        });
        // Sort each section annotations by range_start if present, otherwise keep insertion order.
        for (const [key, list] of bySection.entries()) {
            list.sort((x, y) => {
                if (x.range_start === null || y.range_start === null) return 0;
                return x.range_start - y.range_start;
            });
            bySection.set(key, list);
        }
        return bySection;
    }, [annotations]);

    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    const renderContent = (sectionKey, text) => {
        const content = typeof text === 'string' ? text : '';
        const sectionAnnotations = annotationsBySection.get(sectionKey) || [];

        if (!sectionAnnotations.length) return content;

        // Prefer robust range-based rendering when possible.
        const hasAnyRanges = sectionAnnotations.some(a => a.range_start !== null && a.range_end !== null);
        if (hasAnyRanges) {
            const elements = [];
            let cursor = 0;

            const commentNumbers = new Map();
            let commentCounter = 0;
            const getCommentNumber = (id) => {
                if (!id) return null;
                if (!commentNumbers.has(id)) {
                    commentCounter += 1;
                    commentNumbers.set(id, commentCounter);
                }
                return commentNumbers.get(id);
            };

            for (const ann of sectionAnnotations) {
                if (ann.range_start === null || ann.range_end === null) continue;

                const start = clamp(ann.range_start, 0, content.length);
                const end = clamp(ann.range_end, 0, content.length);
                if (end <= start) continue;

                if (start > cursor) {
                    elements.push(content.slice(cursor, start));
                }

                const markedText = content.slice(start, end);
                const isActive = activeAnnotationId === ann.id;

                const commentNumber = ann.type === 'comment' ? getCommentNumber(ann.id) : null;
                elements.push(
                    <mark
                        key={ann.id}
                        id={`highlight-${ann.id}`}
                        className={clsx(
                            'cursor-pointer rounded-sm px-0 py-0.5 border-b-2 transition-colors',
                            ann.type === 'highlight' && 'bg-yellow-200/50 border-yellow-400 text-slate-900 hover:bg-yellow-300/60',
                            ann.type === 'comment' && 'bg-indigo-100/50 border-indigo-500 hover:bg-indigo-200/50',
                            isActive && 'ring-2 ring-amber-300 bg-yellow-300/60'
                        )}
                        title={ann.quote ? `${ann.type}: ${ann.quote}` : ann.type}
                        onMouseEnter={() => onAnnotationHover && onAnnotationHover(ann.id)}
                        onMouseLeave={() => onAnnotationHover && onAnnotationHover(null)}
                    >
                        {markedText}
                        {commentNumber && (
                            <a
                                href={`#annotation-${ann.id}`}
                                className="ml-1 align-super text-[10px] font-sans font-bold text-indigo-700 hover:underline"
                                title={`Ver comentario [${commentNumber}]`}
                                aria-label={`Ver comentario ${commentNumber}`}
                                onClick={(e) => {
                                    // Avoid interfering with selection/highlight.
                                    e.stopPropagation();
                                }}
                            >
                                [{commentNumber}]
                            </a>
                        )}
                    </mark>
                );

                cursor = end;
            }

            if (cursor < content.length) {
                elements.push(content.slice(cursor));
            }

            return <>{elements}</>;
        }

        // Fallback: quote-based highlighting (string split). We'll only highlight the first occurrence per annotation
        // to avoid painting unrelated repeats.
        let parts = [content];

        const commentNumbers = new Map();
        let commentCounter = 0;
        const getCommentNumber = (id) => {
            if (!id) return null;
            if (!commentNumbers.has(id)) {
                commentCounter += 1;
                commentNumbers.set(id, commentCounter);
            }
            return commentNumbers.get(id);
        };

        sectionAnnotations.forEach((ann) => {
            const quote = ann.quote;
            if (!quote) return;

            const newParts = [];
            let replaced = false;

            parts.forEach((part) => {
                if (typeof part !== 'string') {
                    newParts.push(part);
                    return;
                }

                if (replaced) {
                    newParts.push(part);
                    return;
                }

                const idx = part.indexOf(quote);
                if (idx === -1) {
                    newParts.push(part);
                    return;
                }

                replaced = true;
                const before = part.slice(0, idx);
                const after = part.slice(idx + quote.length);
                const isActive = activeAnnotationId === ann.id;
                const commentNumber = ann.type === 'comment' ? getCommentNumber(ann.id) : null;

                if (before) newParts.push(before);
                newParts.push(
                    <mark
                        key={ann.id}
                        id={`highlight-${ann.id}`}
                        className={clsx(
                            'bg-yellow-200/50 cursor-pointer rounded-sm hover:bg-yellow-300 transition-colors',
                            isActive && 'bg-yellow-300 ring-2 ring-yellow-400'
                        )}
                        title={ann.type}
                        onMouseEnter={() => onAnnotationHover && onAnnotationHover(ann.id)}
                        onMouseLeave={() => onAnnotationHover && onAnnotationHover(null)}
                    >
                        {quote}
                        {commentNumber && (
                            <a
                                href={`#annotation-${ann.id}`}
                                className="ml-1 align-super text-[10px] font-sans font-bold text-indigo-700 hover:underline"
                                title={`Ver comentario [${commentNumber}]`}
                                aria-label={`Ver comentario ${commentNumber}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                            >
                                [{commentNumber}]
                            </a>
                        )}
                    </mark>
                );
                if (after) newParts.push(after);
            });

            parts = newParts;
        });

        return parts;
    };

    return (
        <div
            id="printable-paper"
            className="w-[850px] bg-white shadow-xl min-h-[1100px] p-[60px] md:p-[80px] mx-auto transition-all print:shadow-none print:bg-white print:max-w-none print:w-[190mm] print:min-h-0 print:p-0"
        >
            {/* Header of the Paper */}
            <div className="border-b border-slate-200 pb-6 mb-12">
                <h1 className="text-4xl font-serif text-slate-900 leading-tight">
                    Periodo: {formatShortDate(reportMeta?.startDate)} — {formatShortDate(reportMeta?.endDate)}
                </h1>

                <div className="mt-3 flex justify-between items-end text-sm font-sans text-slate-500 uppercase tracking-widest">
                    <span>{reportMeta?.authorName || 'Reporte'}'s Report</span>
                    <span className={clsx("font-bold", reportMeta.status === 'approved' ? "text-emerald-600" : "text-slate-400")}>
                        {reportMeta.status?.toUpperCase()}
                    </span>
                </div>

                {/* Detailed meta (inside the paper, not the top bar) */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
                    <div className="space-y-2">
                        <div className="text-xs text-slate-500">
                            <span className="font-semibold text-slate-600">Enviado por:</span>{' '}
                            <span className="font-semibold text-slate-700">{reportMeta?.authorName || '—'}</span>
                        </div>
                        <div className="text-xs text-slate-500">
                            <span className="font-semibold text-slate-600">Fecha:</span>{' '}
                            <span className="text-slate-600">
                                {reportMeta?.submittedAt || reportMeta?.createdAt
                                    ? new Date(reportMeta.submittedAt || reportMeta.createdAt).toLocaleString()
                                    : '—'}
                            </span>
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                            Miembros
                        </div>
                        {Array.isArray(reportMeta?.reviewers) && reportMeta.reviewers.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {reportMeta.reviewers.map((m) => {
                                    const isAuthor = m?.id && reportMeta?.authorId && m.id === reportMeta.authorId;
                                    const state = (m?.status || 'pending').toString().toLowerCase();
                                    const isApproved = state === 'approved';
                                    const isChanges = state === 'changes_requested';

                                    // Only show timestamps for an explicit decision (approve/changes).
                                    const when = m?.decisionAt ? new Date(m.decisionAt).toLocaleString() : '';

                                    const label = isAuthor
                                        ? 'AUTOR'
                                        : (isApproved ? 'APPROVED' : isChanges ? 'CHANGES' : 'PENDING');

                                    // Styling: author is neutral and never shown as pending.
                                    const chipClass = isAuthor
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                        : (
                                            isApproved
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                : isChanges
                                                    ? 'bg-amber-50 text-amber-800 border-amber-100'
                                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                        );
                                    return (
                                        <div
                                            key={m?.id || m?.name}
                                            className={clsx(
                                                'text-[11px] px-2 py-1 rounded-md border',
                                                chipClass
                                            )}
                                        >
                                            <span className="font-semibold">{m?.name || 'Miembro'}</span>
                                            <span className="ml-1.5 font-bold uppercase tracking-wide">
                                                {label}
                                            </span>
                                            {when ? <span className="ml-1.5">• {when}</span> : null}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400">—</div>
                        )}
                    </div>
                </div>


            </div>

            {/* Sections */}
            <div className="space-y-12 font-serif text-lg leading-relaxed text-slate-800">
                {sectionKeys.map(key => {
                    const content = sections[key];
                    if (!content) return null;
                    const Icon = SECTION_ICONS[key] || Target;

                    // Color mapping for sections
                    const sectionColorClasses = {
                        context: 'bg-indigo-500 border-indigo-600 text-white',
                        experimental: 'bg-purple-500 border-purple-600 text-white',
                        findings: 'bg-yellow-500 border-yellow-600 text-white',
                        difficulties: 'bg-red-500 border-red-600 text-white',
                        nextSteps: 'bg-green-500 border-green-600 text-white'
                    };

                    const colorClass = sectionColorClasses[key] || 'bg-slate-100 border-slate-200 text-slate-600';

                    return (
                        <section
                            key={key}
                            className="relative group scroll-mt-28"
                            aria-labelledby={`section-heading-${key}`}
                        >
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <h3
                                    id={`section-heading-${key}`}
                                    className="font-sans font-bold text-xs md:text-sm uppercase tracking-wider flex items-center gap-2"
                                >
                                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border ${colorClass}`}>
                                        <Icon className="w-4 h-4" />
                                    </span>
                                    <span className="leading-none text-slate-700">{SECTION_LABELS[key]}</span>
                                </h3>

                                <a
                                    href={`#section-${key}`}
                                    className="font-sans text-[11px] text-slate-400 hover:text-slate-600 underline decoration-transparent hover:decoration-slate-300 transition-colors print:hidden"
                                    aria-label={`Ir a la sección ${SECTION_LABELS[key]}`}
                                >
                                    #
                                </a>
                            </div>

                            <div className="h-px bg-slate-100 mb-5" />

                            {/* Text Content Area */}
                            <div
                                className="whitespace-pre-wrap outline-none selection:bg-indigo-100 selection:text-indigo-900 text-justify"
                                onMouseUp={(e) => handleMouseUp(e, key)}
                                id={`section-${key}`}
                            >
                                {renderContent(key, content)}
                            </div>
                        </section>
                    );
                })}
            </div>

            {/* Completed Tasks Section */}
            {completedTasks && completedTasks.length > 0 && (
                <div className="mt-12 space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                        <h3 className="font-sans font-bold text-xs md:text-sm uppercase tracking-wider flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500 border border-emerald-600 text-white">
                                <Target className="w-4 h-4" />
                            </span>
                            <span className="leading-none text-slate-700">Tareas Terminadas</span>
                        </h3>
                    </div>
                    <div className="h-px bg-slate-100 mb-5" />

                    <div className="space-y-3 font-sans">
                        {completedTasks.map(task => (
                            <div
                                key={task.id}
                                className="bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors"
                            >
                                <div className="font-medium text-slate-800 text-sm">
                                    {task.title}
                                </div>
                                {task.description && (
                                    <div className="text-xs text-slate-500 mt-1">
                                        {task.description}
                                    </div>
                                )}
                                <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                                    <span>Estado: <span className="text-emerald-600 font-medium">done</span></span>
                                    {task.priority && <span>• Prioridad: {task.priority}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Simple Footer for Paper */}
            <div className="mt-20 pt-8 border-t border-slate-100 flex justify-between text-xs text-slate-300 font-sans print:hidden">
                <span>PhD Nexus Scientific Report</span>
                <span>Page 1 of 1</span>
            </div>
        </div>
    );
}
