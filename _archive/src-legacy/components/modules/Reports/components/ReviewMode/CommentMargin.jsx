import React, { useEffect, useMemo, useRef, useState } from 'react';

import TaskList from './_shared/TaskList';
import CommentCard from './_shared/CommentCard';
import DraftCommentCard from './_shared/DraftCommentCard';

export default function CommentMargin({
    comments = [],
    tasks = [], // Link tasks
    resources = [],
    draftAnnotation,
    onSaveDraft,
    onCancelDraft,
    onDeleteComment,

    // props actually used by ReportReadView
    activeAnnotationId,
    onHover,
    onReply
}) {
    const [threadTops, setThreadTops] = useState({});
    const [draftTop, setDraftTop] = useState(null);
    const [expandedThreads, setExpandedThreads] = useState(() => ({}));
    const threadRefs = useRef({});
    const marginRootRef = useRef(null);
    const commentsRailRef = useRef(null);

    const normalizedComments = useMemo(() => {
        return (comments || []).map((c) => {
            const createdAt = c.created_at || c.date || c.createdAt;
            return {
                ...c,
                author: c.author || 'Unknown',
                created_at: createdAt,
                text: c.text ?? c.content ?? ''
            };
        });
    }, [comments]);

    const threaded = useMemo(() => {
        const list = normalizedComments || [];

        const byId = new Map(list.filter(Boolean).map((c) => [c.id, c]));

        const childrenByParent = new Map();
        const roots = [];

        for (const c of list) {
            const parentId = c?.parent_id;
            const isReply = Boolean(parentId && byId.has(parentId));

            if (isReply) {
                if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
                childrenByParent.get(parentId).push(c);
            } else {
                roots.push(c);
            }
        }

        const sortByCreatedAt = (a, b) => {
            const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
            return ta - tb;
        };

        roots.sort(sortByCreatedAt);
        for (const [pid, children] of childrenByParent.entries()) {
            children.sort(sortByCreatedAt);
            childrenByParent.set(pid, children);
        }

        return { roots, childrenByParent };
    }, [normalizedComments]);

    useEffect(() => {
        // Position threads roughly aligned with their highlighted text.
        // Heuristic: look for #highlight-{annotationId} in the paper, map it into the scroll container,
        // then offset the thread wrapper to that Y.
        const compute = () => {
            const container = document.getElementById('report-container');
            if (!container) {
                setThreadTops({});
                return;
            }

            const marginEl = marginRootRef.current;
            const railEl = commentsRailRef.current;
            if (!marginEl || !railEl) {
                setThreadTops({});
                return;
            }

            const containerRect = container.getBoundingClientRect();
            const railRect = railEl.getBoundingClientRect();

            // 1) raw targets
            const raw = threaded.roots
                .filter((c) => c?.id)
                .map((c) => {
                    const el = document.getElementById(`highlight-${c.id}`);
                    if (!el) return { id: c.id, y: null };
                    const r = el.getBoundingClientRect();
                    // Anchor as close as possible to the actual line: use top of highlight.
                    // Convert to an offset within the scroll container.
                    const docY = (r.top - containerRect.top) + container.scrollTop;

                    // Convert to an offset within the COMMENTS rail only (below Tasks/Resources header blocks).
                    const railDocY = (railRect.top - containerRect.top) + container.scrollTop;
                    const y = Math.max(0, docY - railDocY);
                    return { id: c.id, y: Number.isFinite(y) ? y : null };
                });

            // 2) spread to avoid overlaps (Word-like stacking using measured heights)
            // Important: only threads with an actual anchor participate. Otherwise a newly created
            // comment with no highlight element yet would enter as y=0 and push everything down.
            const MIN_GAP = 6; // px between threads (compact)
            const sorted = raw
                .map(({ id, y }) => ({ id, y, hasAnchor: y !== null }))
                .filter((x) => x.hasAnchor)
                .sort((a, b) => a.y - b.y);

            const spaced = [];
            let cursor = 0;
            for (const item of sorted) {
                const desired = Math.max(0, item.y);

                // Only push down if it would overlap the previous thread.
                const placed = desired < cursor ? cursor : desired;
                spaced.push({ ...item, placed });

                const el = threadRefs.current?.[item.id];
                const h = el?.offsetHeight;
                const height = Number.isFinite(h) && h > 0 ? h : 120;
                cursor = placed + height + MIN_GAP;
            }

            const map = {};
            for (const item of spaced) map[item.id] = item.placed;

            // Avoid jumpy rerenders on tiny pixel changes
            setThreadTops((prev) => {
                const EPS = 2;
                const keys = new Set([...Object.keys(prev || {}), ...Object.keys(map || {})]);
                for (const k of keys) {
                    const a = prev?.[k];
                    const b = map?.[k];
                    if (a === undefined && b === undefined) continue;
                    if (a === undefined || b === undefined) return map;
                    if (Math.abs(a - b) > EPS) return map;
                }
                return prev;
            });
        };

        // Initial + after layout settles
        compute();
        const t = window.setTimeout(compute, 50);

        const container = document.getElementById('report-container');
        container?.addEventListener('scroll', compute, { passive: true });
        window.addEventListener('resize', compute);

        return () => {
            window.clearTimeout(t);
            container?.removeEventListener('scroll', compute);
            window.removeEventListener('resize', compute);
        };
    }, [threaded.roots, expandedThreads]);

    useEffect(() => {
        // Anchor draft card to the currently-selected text (same rail coordinate system)
        // so opening the draft doesn't feel like it "jumps" to the top of the margin.
        const computeDraft = () => {
            if (!draftAnnotation) {
                setDraftTop(null);
                return;
            }

            const container = document.getElementById('report-container');
            const railEl = commentsRailRef.current;
            if (!container || !railEl) {
                setDraftTop(null);
                return;
            }

            const containerRect = container.getBoundingClientRect();
            const railRect = railEl.getBoundingClientRect();

            // Primary: use draftAnnotation.y (absolute document Y captured from the selection Range rect).
            // This exists immediately when user clicks the comment button (before save / before highlight ids exist).
            const absY = typeof draftAnnotation?.y === 'number' ? draftAnnotation.y : null;
            if (absY === null) {
                setDraftTop(null);
                return;
            }

            // IMPORTANT: absY was computed as rect.top + window.scrollY in useReviewSession.
            // But our scrolling happens inside #report-container, not the window.
            // Convert absY into the same doc-space used by the rest of the rail (container scroll-space).
            const winScrollY = window.scrollY || document.documentElement.scrollTop || 0;
            const docY = (absY - winScrollY) - containerRect.top + container.scrollTop;
            const railDocY = (railRect.top - containerRect.top) + container.scrollTop;
            const y = Math.max(0, docY - railDocY);
            setDraftTop(Number.isFinite(y) ? y : null);
        };

        computeDraft();
        const t = window.setTimeout(computeDraft, 50);
        const container = document.getElementById('report-container');
        container?.addEventListener('scroll', computeDraft, { passive: true });
        window.addEventListener('resize', computeDraft);

        return () => {
            window.clearTimeout(t);
            container?.removeEventListener('scroll', computeDraft);
            window.removeEventListener('resize', computeDraft);
        };
    }, [draftAnnotation]);

    const orderedRoots = useMemo(() => {
        const roots = threaded.roots || [];

        // Sort by anchored Y (if present), else by created_at.
        return [...roots].sort((a, b) => {
            const ya = a?.id != null ? threadTops[a.id] : undefined;
            const yb = b?.id != null ? threadTops[b.id] : undefined;
            const hasA = typeof ya === 'number';
            const hasB = typeof yb === 'number';
            if (hasA && hasB) return ya - yb;
            if (hasA && !hasB) return -1;
            if (!hasA && hasB) return 1;

            const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
            return ta - tb;
        });
    }, [threaded.roots, threadTops]);

    useEffect(() => {
        // When the paper link navigates to #annotation-{id}, expand the thread and scroll it into view.
        const handleHash = () => {
            const hash = window.location.hash || '';
            const match = hash.match(/^#annotation-(.+)$/);
            if (!match) return;
            const id = match[1];
            if (!id) return;

            // If it's a reply id, find its root parent so we expand the right thread.
            const byId = new Map((normalizedComments || []).filter(Boolean).map((c) => [c.id, c]));
            let rootId = id;
            let guard = 0;
            while (guard < 10) {
                guard += 1;
                const c = byId.get(rootId);
                if (!c?.parent_id) break;
                rootId = c.parent_id;
            }

            setExpandedThreads((prev) => ({ ...prev, [rootId]: true }));

            // Don't force-scroll: it creates jumpy behavior while writing.
            // We rely on the anchoring algorithm to keep the thread aligned to the text line.
            const highlight = document.getElementById(`highlight-${rootId}`) || document.getElementById(`highlight-${id}`);
            if (highlight) {
                highlight.classList.remove('comment-highlight-flash');
                // eslint-disable-next-line no-unused-expressions
                highlight.offsetHeight;
                highlight.classList.add('comment-highlight-flash');
                window.setTimeout(() => highlight.classList.remove('comment-highlight-flash'), 1200);
            }
        };

        // Initial + on changes
        handleHash();
        window.addEventListener('hashchange', handleHash);
        return () => window.removeEventListener('hashchange', handleHash);
    }, [normalizedComments]);

    return (
        <div
            ref={marginRootRef}
            className="w-[320px] flex flex-col pt-[80px] pb-20 space-y-4 print:hidden sticky top-0 self-start"
        >

            {/* Linked Tasks Section */}
            <TaskList tasks={tasks} variant="compact" title="Próximos pasos" mode="nextSteps" initialVisible={3} />

            {/* Linked Resources */}
            {resources?.length > 0 && (
                <div className="space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-slate-300 pl-2">
                        Recursos
                    </div>

                    <div className="space-y-2">
                        {resources.map((r) => (
                            <a
                                key={r.linkId || r.id || r.title}
                                href={r.url || r.link || '#'}
                                target={r.url || r.link ? '_blank' : undefined}
                                rel={r.url || r.link ? 'noreferrer' : undefined}
                                className="block bg-white/80 p-3 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                                aria-label={r.url || r.link ? `Abrir recurso: ${r.title || 'Recurso'}` : undefined}
                            >
                                <div className="text-xs font-bold truncate text-blue-700 hover:text-blue-800 underline underline-offset-2 decoration-blue-200">
                                    {r.title || r.name || 'Recurso'}
                                </div>
                                {(r.summary || r.description) && (
                                    <div className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                                        {r.summary || r.description}
                                    </div>
                                )}
                            </a>
                        ))}
                    </div>

                    <div className="border-b border-slate-100 my-2" />
                </div>
            )}

            {/* Header/Title for the track */}
            <div ref={commentsRailRef} className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 pl-2">
                Comentarios
            </div>

            {/*
              Existing Comments (Threaded)
              Render in an overlay rail so computed `top` doesn't consume layout space.
              This avoids the "new comment adds huge spacing" effect you described.
            */}
            <div className="relative">
                <div className="relative min-h-[120px]">
                    {orderedRoots.map((comment, index) => (
                        <div
                            key={comment.id || index}
                            className="absolute left-0 right-0 transition-[top] duration-200 ease-out"
                            ref={(node) => {
                                if (!comment?.id) return;
                                if (!node) {
                                    delete threadRefs.current[comment.id];
                                } else {
                                    threadRefs.current[comment.id] = node;
                                }
                            }}
                            style={comment.id && threadTops[comment.id] !== undefined ? { top: threadTops[comment.id] } : { top: 0 }}
                        >
                            <CommentCard
                                comment={comment}
                                active={activeAnnotationId === comment.id}
                                onHover={onHover}
                                onReply={onReply}
                                onDelete={onDeleteComment}
                                replies={threaded.childrenByParent.get(comment.id) || []}
                                repliesExpanded={expandedThreads[comment.id] !== false}
                                onToggleReplies={(threadId) => {
                                    setExpandedThreads((prev) => {
                                        const isExpanded = prev[threadId] !== false;
                                        return { ...prev, [threadId]: !isExpanded };
                                    });
                                }}
                                avatarVariant="indigo"
                            />
                        </div>
                    ))}

                    {draftAnnotation && typeof draftTop === 'number' && (
                        <div
                            className="absolute left-0 right-0"
                            style={{ top: draftTop }}
                        >
                            <DraftCommentCard
                                draftAnnotation={draftAnnotation}
                                onSave={onSaveDraft}
                                onCancel={onCancelDraft}
                                variant="compact"
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
