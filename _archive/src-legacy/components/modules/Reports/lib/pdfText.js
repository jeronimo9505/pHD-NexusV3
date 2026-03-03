import { jsPDF } from 'jspdf';

const SECTION_LABELS = {
    context: 'Contexto / Objetivo',
    experimental: 'Trabajo Experimental',
    findings: 'Hallazgos Principales',
    difficulties: 'Dificultades y Retos',
    nextSteps: 'Próximos Pasos'
};

const SECTION_KEYS = ['context', 'experimental', 'findings', 'difficulties', 'nextSteps'];

function safeDate(value) {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
}

function fmtDate(value) {
    const d = safeDate(value);
    return d ? d.toLocaleDateString() : '—';
}

function normalizeText(s) {
    return (s ?? '').toString().replace(/\r\n/g, '\n');
}

/**
 * Draws a justified paragraph (selectable text) by distributing extra width
 * across spaces between words (except last line).
 *
 * Notes:
 * - Justification is approximate (font metrics are imperfect), but looks good.
 * - Avoids justification on very short lines.
 */
function drawJustifiedParagraph(doc, {
    text,
    x,
    y,
    maxWidth,
    lineHeight,
    minSpacesToJustify = 3
}) {
    const paragraphs = normalizeText(text).split(/\n/g);
    let cursorY = y;

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx += 1) {
        const para = paragraphs[pIdx].trimEnd();
        if (!para.trim()) {
            cursorY += lineHeight;
            continue;
        }

        const lines = doc.splitTextToSize(para, maxWidth);

        for (let i = 0; i < lines.length; i += 1) {
            const line = String(lines[i]);

            // Last line: normal left aligned
            const isLastLine = i === lines.length - 1;
            if (isLastLine) {
                doc.text(line, x, cursorY);
                cursorY += lineHeight;
                continue;
            }

            const words = line.split(/\s+/).filter(Boolean);
            const spaces = Math.max(0, words.length - 1);
            if (spaces < minSpacesToJustify) {
                doc.text(line, x, cursorY);
                cursorY += lineHeight;
                continue;
            }

            // Measure words width + base single spaces
            const wordsWidth = words.reduce((acc, w) => acc + doc.getTextWidth(w), 0);
            const baseSpaceW = doc.getTextWidth(' ');
            const baseLineW = wordsWidth + baseSpaceW * spaces;

            const extra = maxWidth - baseLineW;
            // If extra negative or too large, fallback
            if (!Number.isFinite(extra) || extra <= 0) {
                doc.text(line, x, cursorY);
                cursorY += lineHeight;
                continue;
            }

            const extraPerSpace = extra / spaces;

            // Draw word-by-word distributing spacing
            let cursorX = x;
            for (let wIdx = 0; wIdx < words.length; wIdx += 1) {
                const w = words[wIdx];
                doc.text(w, cursorX, cursorY);
                cursorX += doc.getTextWidth(w);
                if (wIdx !== words.length - 1) {
                    cursorX += baseSpaceW + extraPerSpace;
                }
            }

            cursorY += lineHeight;
        }

        // Paragraph spacing
        if (pIdx !== paragraphs.length - 1) {
            cursorY += lineHeight * 0.4;
        }
    }

    return cursorY;
}

/**
 * Generate a vector-text PDF (selectable text) from report meta + sections.
 * This does NOT screenshot the DOM; it reflows text in jsPDF.
 */
export function downloadReportPdfText({
    reportMeta,
    sections,
    tasks = [],
    completedTasks = [],
    comments = [],
    resources = [],
    filename = 'report.pdf'
}) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    // Page metrics
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const marginX = 16;
    const marginTop = 18;
    const marginBottom = 18;
    const contentW = pageW - marginX * 2;

    let y = marginTop;

    const ensureSpace = (needed) => {
        if (y + needed <= pageH - marginBottom) return;
        doc.addPage();
        y = marginTop;
    };

    const drawDivider = (color = 210) => {
        doc.setDrawColor(color);
        doc.setLineWidth(0.2);
        doc.line(marginX, y, pageW - marginX, y);
    };

    const drawCard = ({
        title,
        meta,
        body
    }) => {
        const padX = 3;
        const padY = 3;
        const width = contentW;

        // Prepare text lines
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        const titleLines = doc.splitTextToSize(title, width - padX * 2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const metaLines = meta ? doc.splitTextToSize(meta, width - padX * 2) : [];

        doc.setFont('times', 'normal');
        doc.setFontSize(11);
        const bodyLines = body ? doc.splitTextToSize(body, width - padX * 2) : [];

        const lineHTitle = 4.5;
        const lineHMeta = 4.2;
        const lineHBody = 5.0;
        const cardH =
            padY * 2 +
            titleLines.length * lineHTitle +
            (metaLines.length ? 1 + metaLines.length * lineHMeta : 0) +
            (bodyLines.length ? 1 + bodyLines.length * lineHBody : 0);

        ensureSpace(cardH + 2);

        // Border
        doc.setDrawColor(220);
        doc.setLineWidth(0.3);
        doc.roundedRect(marginX, y, width, cardH, 2.5, 2.5);

        let cy = y + padY + 3;

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(30);
        titleLines.forEach((ln) => {
            doc.text(ln, marginX + padX, cy);
            cy += lineHTitle;
        });

        // Meta
        if (metaLines.length) {
            cy += 1;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(110);
            metaLines.forEach((ln) => {
                doc.text(ln, marginX + padX, cy);
                cy += lineHMeta;
            });
        }

        // Body (justified)
        if (bodyLines.length) {
            cy += 1;
            doc.setFont('times', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(0);
            cy = drawJustifiedParagraph(doc, {
                text: body,
                x: marginX + padX,
                y: cy,
                maxWidth: width - padX * 2,
                lineHeight: lineHBody
            });
        }

        doc.setTextColor(0);
        y += cardH + 5;
    };

    const drawLinkedLine = ({ label, url }) => {
        const safeUrl = (url ?? '').toString().trim();
        const safeLabel = (label ?? '').toString().trim() || safeUrl || 'Recurso';
        if (!safeUrl) {
            // No url: plain text
            const lines = doc.splitTextToSize(safeLabel, contentW);
            lines.forEach((ln) => {
                ensureSpace(6);
                doc.text(ln, marginX, y);
                y += 5.3;
            });
            return;
        }

        const left = `${safeLabel} — `;
        const leftW = doc.getTextWidth(left);

        ensureSpace(6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(40);
        doc.text(left, marginX, y);

        doc.setTextColor(30, 64, 175);
        doc.textWithLink(safeUrl, marginX + leftW, y, { url: safeUrl });
        doc.setTextColor(0);
        y += 5.8;
    };

    // ===== HEADER =====
    // Title: "Periodo: date — date"
    doc.setFont('times', 'normal');
    doc.setFontSize(20);
    doc.setTextColor(30);
    const titleText = `Periodo: ${fmtDate(reportMeta?.startDate)} — ${fmtDate(reportMeta?.endDate)}`;
    ensureSpace(10);
    doc.text(titleText, marginX, y);
    y += 10;

    // Subtitle: "Author's Report" and STATUS
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100);
    const authorLine = `${(reportMeta?.authorName || 'REPORTE').toUpperCase()}'S REPORT`;
    const statusText = String(reportMeta?.status || 'DRAFT').toUpperCase();

    // Left side: author
    doc.text(authorLine, marginX, y);

    // Right side: status
    const statusColor = reportMeta?.status === 'reviewed' || reportMeta?.status === 'approved'
        ? [16, 185, 129] // emerald
        : [148, 163, 184]; // slate
    doc.setTextColor(...statusColor);
    doc.setFont('helvetica', 'bold');
    const statusW = doc.getTextWidth(statusText);
    doc.text(statusText, pageW - marginX - statusW, y);
    doc.setTextColor(0);
    y += 8;

    // Divider
    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(marginX, y, pageW - marginX, y);
    y += 8;

    // Metadata section
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    // Left column: Enviado por y Fecha
    const leftX = marginX;
    let leftY = y;

    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.text('Enviado por:', leftX, leftY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    const sentByW = doc.getTextWidth('Enviado por: ');
    doc.text(reportMeta?.authorName || '—', leftX + sentByW, leftY);
    leftY += 5;

    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.text('Fecha:', leftX, leftY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    const dateW = doc.getTextWidth('Fecha: ');
    const submittedDate = reportMeta?.submittedAt || reportMeta?.createdAt;
    const dateStr = submittedDate ? new Date(submittedDate).toLocaleString('es-ES') : '—';
    doc.text(dateStr, leftX + dateW, leftY);

    // Right column: Miembros
    const rightX = pageW / 2 + 5;
    let rightY = y;

    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('MIEMBROS', rightX, rightY);
    rightY += 5;

    // Reviewers list
    const reviewers = reportMeta?.reviewers || [];
    if (reviewers.length > 0) {
        doc.setFontSize(8);
        reviewers.forEach((m) => {
            const isAuthor = m?.id && reportMeta?.authorId && m.id === reportMeta.authorId;
            const state = (m?.status || 'pending').toString().toLowerCase();
            const isApproved = state === 'approved';
            const isChanges = state === 'changes_requested';

            const label = isAuthor ? 'AUTOR' : (isApproved ? 'APPROVED' : isChanges ? 'CHANGES' : 'PENDING');
            const name = m?.name || 'Miembro';

            // Color coding
            let color = [100, 116, 139]; // slate default
            if (isAuthor) color = [99, 102, 241]; // indigo
            else if (isApproved) color = [16, 185, 129]; // emerald
            else if (isChanges) color = [245, 158, 11]; // amber

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...color);
            const text = `${name} - ${label}`;
            doc.text(text, rightX, rightY);
            rightY += 4;
        });
    } else {
        doc.setTextColor(150);
        doc.text('—', rightX, rightY);
    }

    doc.setTextColor(0);
    y = Math.max(leftY, rightY) + 8;

    // Final divider before content
    doc.setDrawColor(30);
    doc.setLineWidth(0.3);
    doc.line(marginX, y, pageW - marginX, y);
    y += 10;

    // Content
    SECTION_KEYS.forEach((key) => {
        const raw = sections?.[key];
        const text = normalizeText(raw);
        if (!text.trim()) return;

        // Section heading with colored background
        const sectionColors = {
            context: [99, 102, 241],      // indigo
            experimental: [139, 92, 246], // purple
            findings: [234, 179, 8],      // yellow
            difficulties: [239, 68, 68],  // red
            nextSteps: [34, 197, 94]      // green
        };

        const bgColor = sectionColors[key] || [100, 116, 139];

        ensureSpace(12);

        // Draw colored background bar
        doc.setFillColor(...bgColor);
        doc.setDrawColor(...bgColor);
        doc.roundedRect(marginX, y - 3, contentW, 8, 1.5, 1.5, 'F');

        // Section title on colored background
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text((SECTION_LABELS[key] || key).toUpperCase(), marginX + 3, y + 2);
        doc.setTextColor(0);
        y += 10;

        // Body (justified)
        doc.setFont('times', 'normal');
        doc.setFontSize(12);

        // We'll justify paragraph-by-paragraph, ensuring space page-by-page.
        const paragraphs = text.split(/\n\s*\n/g);
        paragraphs.forEach((p, idx) => {
            const para = p.trim();
            if (!para) return;

            // Estimate lines to ensure space. If it overflows, page-break first.
            const approxLines = doc.splitTextToSize(para, contentW).length;
            const approxHeight = approxLines * 5.3 + (idx !== paragraphs.length - 1 ? 3 : 0);
            ensureSpace(Math.min(approxHeight, pageH));

            y = drawJustifiedParagraph(doc, {
                text: para,
                x: marginX,
                y,
                maxWidth: contentW,
                lineHeight: 5.3
            });

            if (idx !== paragraphs.length - 1) y += 3;
        });

        y += 8;
    });

    // ---- Completed Tasks ----
    const normCompletedTasks = (completedTasks || []).map((t) => ({
        id: t.id,
        title: t.title || 'Tarea',
        status: 'done',
        priority: t.priority || '—',
        completed_at: t.completed_at || null,
        description: normalizeText(t.description || '')
    }));

    if (normCompletedTasks.length) {
        ensureSpace(14);

        // Colored header for Tareas Terminadas
        doc.setFillColor(16, 185, 129); // emerald
        doc.setDrawColor(16, 185, 129);
        doc.roundedRect(marginX, y - 3, contentW, 8, 1.5, 1.5, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text('TAREAS TERMINADAS', marginX + 3, y + 2);
        doc.setTextColor(0);
        y += 12;

        normCompletedTasks.forEach((t) => {
            const meta = `Estado: done • Prioridad: ${t.priority} • Completada: ${fmtDate(t.completed_at)}`;
            drawCard({
                title: t.title,
                meta,
                body: t.description
            });
        });
    }

    // ---- Resources (hyperlinks) ----
    const normResources = (resources || []).map((r) => ({
        id: r.linkId || r.id,
        title: r.title || r.name || 'Recurso',
        url: r.url || r.link || r.href || ''
    })).filter((r) => r.title || r.url);

    if (normResources.length) {
        ensureSpace(12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(60);
        doc.text('Recursos', marginX, y);
        doc.setTextColor(0);
        y += 6;
        drawDivider(210);
        y += 6;

        normResources.forEach((r, idx) => {
            const prefix = `[${idx + 1}] `;
            ensureSpace(6);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(70);
            doc.text(prefix, marginX, y);

            const prefixW = doc.getTextWidth(prefix);
            const label = (r.title || 'Recurso').toString();

            // Link is the label (short and nice)
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(30, 64, 175);
            if (r.url) {
                doc.textWithLink(label, marginX + prefixW, y, { url: r.url });
            } else {
                doc.setTextColor(40);
                doc.text(label, marginX + prefixW, y);
            }

            doc.setTextColor(0);
            y += 5.8;
        });

        y += 6;
    }

    // ---- Tasks (as comment-like cards) ----
    const normTasks = (tasks || []).map((t) => ({
        id: t.id,
        title: t.title || t.name || 'Tarea',
        status: t.status || 'open',
        priority: t.priority || '—',
        due_date: t.due_date || t.dueDate || null,
        description: normalizeText(t.description || t.details || '')
    }));

    if (normTasks.length) {
        ensureSpace(12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(60);
        doc.text('Tareas (Próximos pasos)', marginX, y);
        doc.setTextColor(0);
        y += 6;
        drawDivider(210);
        y += 8;

        normTasks.forEach((t) => {
            const meta = `Estado: ${t.status} • Prioridad: ${t.priority} • Vence: ${fmtDate(t.due_date)}`;
            drawCard({
                title: t.title,
                meta,
                body: t.description
            });
        });
    }

    // ---- Comments (as cards) ----
    const normComments = (comments || []).map((c, idx) => {
        const created = c.created_at || c.date || c.createdAt;
        return {
            id: c.id,
            number: idx + 1,
            author: c.author || 'Unknown',
            created_at: created,
            section_key: c.section_key || null,
            quote: normalizeText(c.quote || ''),
            text: normalizeText(c.text ?? c.content ?? '')
        };
    });

    if (normComments.length) {
        ensureSpace(12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(60);
        doc.text('Comentarios', marginX, y);
        doc.setTextColor(0);
        y += 6;
        drawDivider(210);
        y += 8;

        normComments.forEach((c) => {
            const sectionLabel = c.section_key ? (SECTION_LABELS[c.section_key] || c.section_key) : null;
            const metaParts = [
                c.author ? `Autor: ${c.author}` : null,
                c.created_at ? `Fecha: ${fmtDate(c.created_at)}` : null,
                sectionLabel ? `Sección: ${sectionLabel}` : null
            ].filter(Boolean);
            const meta = metaParts.join(' • ');

            const body = [
                c.quote ? `Contexto: "${c.quote}"` : null,
                c.text
            ].filter(Boolean).join('\n\n');

            drawCard({
                title: `Comentario [${c.number}]`,
                meta,
                body
            });
        });
    }

    doc.save(filename);
}
