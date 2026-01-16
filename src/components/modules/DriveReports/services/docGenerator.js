
/**
 * Helper to generate Google Docs API BatchUpdate requests
 * based on the Report ReviewMode format.
 */

export const getReportGenerationRequests = (report, sections) => {
    let text = '';
    const requests = [];
    let currentIndex = 1; // Google Docs starts at index 1

    // Helper to append text and track index
    const appendText = (content) => {
        const start = currentIndex;
        text += content;
        currentIndex += content.length;
        return { start, end: currentIndex };
    };

    // Helper to Create Insert Request (We will allow the caller to just insert 'text' at index 1, 
    // but calculating styles requires knowing the ranges. 
    // ACTUALLY: The best way is to construct the whole text, then creating ONE insert request, 
    // and multiple styling requests based on the calculated ranges.)

    // 1. HEADER (Title)
    // "Periodo: [Start] — [End]"
    const titleText = `Periodo: ${report.period || 'Sin periodo'}\n`;
    const titleRange = appendText(titleText);

    // 2. METADATA
    // "Enviado por: [Name]\nFecha: [Date]\n\n"
    const authorLabel = "Enviado por: ";
    const authorValue = `${report.authorName || 'Desconocido'}\n`;
    const dateLabel = "Fecha: ";
    const dateValue = `${new Date().toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n\n`; // Use current date of generation

    const authorLabelRange = appendText(authorLabel);
    const authorValueRange = appendText(authorValue);
    const dateLabelRange = appendText(dateLabel);
    const dateValueRange = appendText(dateValue);


    // 3. SECTIONS
    const sectionConfig = [
        { key: 'context', label: 'Contexto / Objetivo' },
        { key: 'experimental', label: 'Trabajo Experimental' },
        { key: 'findings', label: 'Hallazgos Principales' },
        { key: 'difficulties', label: 'Dificultades y Retos' },
        { key: 'nextSteps', label: 'Próximos Pasos' }
    ];

    const sectionRanges = [];

    sectionConfig.forEach(sec => {
        const content = sections[sec.key] || 'Sin contenido...';

        // Heading
        const headingText = `${sec.label}\n`;
        const headingRange = appendText(headingText);

        // Content
        let contentText = `${content}\n\n`;
        const contentRange = appendText(contentText);

        sectionRanges.push({ heading: headingRange, content: contentRange });

        // SPECIAL HANDLING: If this is "Next Steps", append Tasks
        if (sec.key === 'nextSteps' && sections.tasks && sections.tasks.length > 0) {
            const taskHeader = "Tareas Pendientes (Próximas):\n";
            const taskHeaderRange = appendText(taskHeader);

            sections.tasks.forEach(task => {
                const isDone = task.done || task.status === 'done';
                // Only show pending tasks here if "Completed Tasks" section handles the done ones?
                // User requirement: "Also add a section for finished tasks". 
                // We keep all tasks here as "Specific Tasks" (maybe rename to Action Plan) or just list pending?
                // For clarity, let's list ALL linked tasks here as check-boxes (Context: Plan), 
                // and the new section is exclusively for "What was done".

                const text = task.text || task.title || 'Tarea sin título';
                const check = isDone ? '[x]' : '[ ]';
                const line = `${check} ${text}\n`;
                const r = appendText(line);
            });
            appendText('\n'); // Spacing
        }
    });

    // 3.5 COMPLETED TASKS SECTION
    if (sections.completedTasks && sections.completedTasks.length > 0) {
        const completedHeader = "Tareas Finalizadas en el Periodo\n";
        const completedHeaderRange = appendText(completedHeader);
        sectionRanges.push({ heading: completedHeaderRange, content: null }); // Reuse heading style

        sections.completedTasks.forEach(task => {
            const dateStr = task.completedAt ? new Date(task.completedAt).toLocaleDateString('es-ES') : '';
            const text = task.title || task.text || 'Sin título';
            const line = `• ${text} (${dateStr})\n`;

            // Detail? User asked for "algo de detalle". 
            // If description exists, add it indented?
            const desc = task.description ? `  ${task.description}\n` : '';

            // Append
            appendText(line + desc);
        });
        appendText('\n');
    }

    // 4. RESOURCES SECTION
    const linkStyles = []; // Store ranges to apply links
    if (sections.resources && sections.resources.length > 0) {
        const resHeading = "Recursos y Referencias\n";
        const resHeadingRange = appendText(resHeading);
        sectionRanges.push({ heading: resHeadingRange, content: null }); // Add to styling loop (content null handling needed)

        sections.resources.forEach(res => {
            const lineText = `• ${res.title}\n`;
            const range = appendText(lineText);

            // Link the Title text only (Skip "• " at start, and "\n" at end)
            const titleStart = range.start + 2;
            const titleEnd = range.end - 1;

            if (res.url && titleEnd > titleStart) {
                linkStyles.push({
                    range: { start: titleStart, end: titleEnd },
                    url: res.url
                });
            }
        });
    }

    // --- CONSTRUCT REQUESTS ---

    // 1. Insert All Text
    requests.push({
        insertText: {
            text: text,
            location: { index: 1 }
        }
    });

    // 2. Style Title (Heading 1)
    requests.push({
        updateParagraphStyle: {
            range: { startIndex: titleRange.start, endIndex: titleRange.end },
            paragraphStyle: { namedStyleType: 'HEADING_1' },
            fields: '*'
        }
    });

    // 3. Style Metadata (Normal, Bold Labels)
    requests.push({
        updateTextStyle: {
            range: { startIndex: authorLabelRange.start, endIndex: authorLabelRange.end },
            textStyle: { bold: true, foregroundColor: { color: { rgbColor: { red: 0.3, green: 0.3, blue: 0.3 } } } },
            fields: '*'
        }
    });
    requests.push({
        updateTextStyle: {
            range: { startIndex: dateLabelRange.start, endIndex: dateLabelRange.end },
            textStyle: { bold: true, foregroundColor: { color: { rgbColor: { red: 0.3, green: 0.3, blue: 0.3 } } } },
            fields: '*'
        }
    });

    // 4. Style Sections
    sectionRanges.forEach(sec => {
        // Heading Style (Heading 2, Indigo)
        requests.push({
            updateParagraphStyle: {
                range: { startIndex: sec.heading.start, endIndex: sec.heading.end },
                paragraphStyle: { namedStyleType: 'HEADING_2' },
                fields: '*'
            }
        });

        // Custom Color for Heading
        requests.push({
            updateTextStyle: {
                range: { startIndex: sec.heading.start, endIndex: sec.heading.end },
                textStyle: { foregroundColor: { color: { rgbColor: { red: 0.31, green: 0.27, blue: 0.90 } } } },
                fields: '*'
            }
        });

        // Content Style (Normal) - Only if content exists (Resources might have null content range in this simple loop)
        if (sec.content) {
            requests.push({
                updateParagraphStyle: {
                    range: { startIndex: sec.content.start, endIndex: sec.content.end },
                    paragraphStyle: { namedStyleType: 'NORMAL_TEXT', alignment: 'JUSTIFIED' },
                    fields: '*'
                }
            });
        }
    });

    // 5. Apply Links
    linkStyles.forEach(item => {
        requests.push({
            updateTextStyle: {
                range: { startIndex: item.range.start, endIndex: item.range.end },
                textStyle: {
                    link: { url: item.url },
                    foregroundColor: { color: { rgbColor: { red: 0.0, green: 0.0, blue: 1.0 } } },
                    underline: true
                },
                fields: '*'
            }
        });
    });

    return requests;
};
