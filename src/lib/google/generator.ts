import { toast } from "sonner";
import { ensureAuth, initGoogleClient } from "./auth";
import { loadGoogleScripts } from "./loader";

// Re-export initialization for components that use it
export const initGapiClient = initGoogleClient;

export const loadGoogleGenerator = async () => {
    await loadGoogleScripts();
};

export const generatePresentation = async (
    title: string,
    metadata: { authorName: string },
    folderId?: string
) => {
    await ensureAuth();
    const gapi = (window as any).gapi;

    // 1. Create Blank Presentation
    const fileMeta: any = {
        name: title,
        mimeType: 'application/vnd.google-apps.presentation'
    };
    if (folderId) {
        fileMeta.parents = [folderId];
    }

    const createRes = await gapi.client.drive.files.create({
        resource: fileMeta,
        fields: 'id, webViewLink'
    });
    const fileId = createRes.result.id;

    // 2. Populate Title Slide
    try {
        const presRes = await gapi.client.slides.presentations.get({
            presentationId: fileId
        });
        const presentation = presRes.result;
        const slides = presentation.slides;

        if (slides && slides.length > 0) {
            const firstSlide = slides[0];
            const elements = firstSlide.pageElements;
            const requests = [];

            if (elements) {
                for (const el of elements) {
                    if (el.shape && el.shape.placeholder) {
                        const type = el.shape.placeholder.type;
                        if (type === 'CENTERED_TITLE' || type === 'TITLE') {
                            requests.push({
                                insertText: {
                                    objectId: el.objectId,
                                    text: title
                                }
                            });
                        } else if (type === 'SUBTITLE' || type === 'BODY') {
                            requests.push({
                                insertText: {
                                    objectId: el.objectId,
                                    text: `Author: ${metadata.authorName}\nDate: ${new Date().toLocaleDateString()}`
                                }
                            });
                        }
                    }
                }
            }

            if (requests.length > 0) {
                await gapi.client.slides.presentations.batchUpdate({
                    presentationId: fileId,
                    resource: { requests }
                });
            }
        }
    } catch (e) {
        console.error("Error populating slides title:", e);
    }
    return createRes.result;
};

export const generateMeetingNote = async (
    title: string,
    metadata: { authorName: string; startDate: string; time: string },
    pendingTasks: Array<{ title: string; status: string; assignees: string; dueDate: string }> = [],
    columns: string[] = ["todo", "in_progress", "done"],
    folderId?: string
) => {
    await ensureAuth();
    const gapi = (window as any).gapi;

    // 1. Create Blank File
    const fileMeta: any = {
        name: title,
        mimeType: 'application/vnd.google-apps.document'
    };
    if (folderId) {
        fileMeta.parents = [folderId];
    }

    const createRes = await gapi.client.drive.files.create({
        resource: fileMeta,
        fields: 'id, webViewLink'
    });
    const fileId = createRes.result.id;

    // 2. Build Content
    let textBuffer = '';
    const styleRequests: any[] = [];
    let currentIndex = 1;

    const append = (text: string, style = 'NORMAL_TEXT') => {
        if (!text) return;
        const start = currentIndex;
        textBuffer += text;
        currentIndex += text.length;

        if (style !== 'NORMAL_TEXT') {
            styleRequests.push({
                updateParagraphStyle: {
                    range: { startIndex: start, endIndex: currentIndex },
                    paragraphStyle: { namedStyleType: style },
                    fields: 'namedStyleType'
                }
            });
        }
    };

    // Header
    append('MEETING NOTE\n', 'HEADING_1');
    append(`Date: ${metadata.startDate}\n`, 'NORMAL_TEXT');
    append(`Time: ${metadata.time}\n`, 'NORMAL_TEXT');
    append(`Created by: ${metadata.authorName}\n\n`, 'NORMAL_TEXT');

    // Attendees
    append('ATTENDEES\n', 'HEADING_2');
    append('- \n- \n\n', 'NORMAL_TEXT');

    // Notes
    append('NOTES / MINUTES\n', 'HEADING_2');
    append('\n\n\n', 'NORMAL_TEXT');

    // Agreements / Next Steps
    append('AGREEMENTS\n', 'HEADING_2');
    append('1. \n2. \n\n', 'NORMAL_TEXT');

    // Pending Tasks (Grouped by Column)
    append('PENDING TASKS\n', 'HEADING_2');

    if (pendingTasks && pendingTasks.length > 0) {
        columns.forEach(colName => {
            const tasksInCol = pendingTasks.filter(t => t.status === colName);
            if (tasksInCol.length > 0) {
                const header = colName.charAt(0).toUpperCase() + colName.slice(1).replace(/_/g, ' ');
                append(`${header}\n`, 'HEADING_3');
                tasksInCol.forEach(task => {
                    const assigneeStr = task.assignees ? `(Assigned: ${task.assignees})` : '';
                    const dateStr = task.dueDate ? `[Due: ${task.dueDate}]` : '';
                    const details = [assigneeStr, dateStr].filter(Boolean).join(' ');
                    append(`[ ] ${task.title} ${details}\n`, 'NORMAL_TEXT');
                });
                append('\n', 'NORMAL_TEXT');
            }
        });

        const unknownTasks = pendingTasks.filter(t => !columns.includes(t.status));
        if (unknownTasks.length > 0) {
            append('Other\n', 'HEADING_3');
            unknownTasks.forEach(task => {
                const assigneeStr = task.assignees ? `(Assigned: ${task.assignees})` : '';
                const dateStr = task.dueDate ? `[Due: ${task.dueDate}]` : '';
                const details = [assigneeStr, dateStr].filter(Boolean).join(' ');
                append(`[ ] ${task.title} ${details}\n`, 'NORMAL_TEXT');
            });
            append('\n', 'NORMAL_TEXT');
        }

    } else {
        append('[ ] \n[ ] \n\n', 'NORMAL_TEXT');
    }

    await gapi.client.docs.documents.batchUpdate({
        documentId: fileId,
        resource: {
            requests: [
                {
                    insertText: {
                        location: { index: 1 },
                        text: textBuffer
                    }
                },
                ...styleRequests
            ]
        }
    });

    return createRes.result;
};

export const generateBlankReport = async (
    title: string,
    metadata: { authorName: string },
    folderId?: string
) => {
    await ensureAuth();
    const gapi = (window as any).gapi;

    const fileMeta: any = {
        name: title,
        mimeType: 'application/vnd.google-apps.document'
    };
    if (folderId) {
        fileMeta.parents = [folderId];
    }

    const createRes = await gapi.client.drive.files.create({
        resource: fileMeta,
        fields: 'id, webViewLink'
    });
    const fileId = createRes.result.id;

    let textBuffer = '';
    textBuffer += `REPORT: ${title}\n`;
    textBuffer += `Author: ${metadata.authorName}\n`;
    textBuffer += `Date: ${new Date().toLocaleDateString()}\n\n`;
    textBuffer += `CONTEXT\n\n`;
    textBuffer += `FINDINGS\n\n`;
    textBuffer += `DIFFICULTIES\n\n`;
    textBuffer += `NEXT STEPS\n\n`;

    await gapi.client.docs.documents.batchUpdate({
        documentId: fileId,
        resource: {
            requests: [{
                insertText: { location: { index: 1 }, text: textBuffer }
            }]
        }
    });

    return createRes.result;
};

export const generateReportWithSections = async (
    title: string,
    metadata: { authorName: string; startDate: string; endDate: string },
    sections: {
        context?: string;
        experimental?: string;
        findings?: string;
        difficulties?: string;
        nextSteps?: string;
        attendees?: string;
        notes?: string;
        agreements?: string;
    },
    folderId?: string,
    type: 'report' | 'meeting_note' | 'ppt' = 'report'
) => {
    await ensureAuth();
    const gapi = (window as any).gapi;

    const fileMeta: any = {
        name: title,
        mimeType: 'application/vnd.google-apps.document'
    };
    if (folderId) {
        fileMeta.parents = [folderId];
    }

    const createRes = await gapi.client.drive.files.create({
        resource: fileMeta,
        fields: 'id, webViewLink'
    });
    const fileId = createRes.result.id;

    let textBuffer = '';
    const styleRequests: any[] = [];
    let currentIndex = 1;

    const append = (text: string, style: string) => {
        const startIdx = currentIndex;
        textBuffer += text;
        currentIndex += text.length;

        if (style === 'HEADING_1') {
            styleRequests.push({
                updateParagraphStyle: {
                    range: { startIndex: startIdx, endIndex: currentIndex },
                    paragraphStyle: { namedStyleType: 'HEADING_1' },
                    fields: 'namedStyleType'
                }
            });
        } else if (style === 'HEADING_2') {
            styleRequests.push({
                updateParagraphStyle: {
                    range: { startIndex: startIdx, endIndex: currentIndex },
                    paragraphStyle: { namedStyleType: 'HEADING_2' },
                    fields: 'namedStyleType'
                }
            });
        }
    };

    append(`${title}\n`, 'HEADING_1');
    append(`Author: ${metadata.authorName}\n`, 'NORMAL_TEXT');

    if (type === 'meeting_note') {
        append(`Date: ${new Date().toLocaleDateString()}\n\n`, 'NORMAL_TEXT');
    } else {
        append(`Period: ${metadata.startDate} - ${metadata.endDate}\n`, 'NORMAL_TEXT');
        append(`Date: ${new Date().toLocaleDateString()}\n\n`, 'NORMAL_TEXT');
    }

    if (type === 'meeting_note') {
        if (sections.attendees) {
            append('ATTENDEES\n', 'HEADING_2');
            append(`${sections.attendees}\n\n`, 'NORMAL_TEXT');
        }
        if (sections.notes) {
            append('NOTES / MINUTES\n', 'HEADING_2');
            append(`${sections.notes}\n\n`, 'NORMAL_TEXT');
        }
        if (sections.agreements) {
            append('AGREEMENTS\n', 'HEADING_2');
            append(`${sections.agreements}\n\n`, 'NORMAL_TEXT');
        }
        append('PENDING TASKS\n', 'HEADING_2');
        append('[ ] \n[ ] \n\n', 'NORMAL_TEXT');

    } else {
        if (sections.context) {
            append('CONTEXT / OBJECTIVE\n', 'HEADING_2');
            append(`${sections.context}\n\n`, 'NORMAL_TEXT');
        }
        if (sections.experimental) {
            append('EXPERIMENTAL WORK\n', 'HEADING_2');
            append(`${sections.experimental}\n\n`, 'NORMAL_TEXT');
        }
        if (sections.findings) {
            append('FINDINGS\n', 'HEADING_2');
            append(`${sections.findings}\n\n`, 'NORMAL_TEXT');
        }
        if (sections.difficulties) {
            append('DIFFICULTIES\n', 'HEADING_2');
            append(`${sections.difficulties}\n\n`, 'NORMAL_TEXT');
        }
        if (sections.nextSteps) {
            append('NEXT STEPS\n', 'HEADING_2');
            append(`${sections.nextSteps}\n\n`, 'NORMAL_TEXT');
        }
    }

    await gapi.client.docs.documents.batchUpdate({
        documentId: fileId,
        resource: {
            requests: [
                {
                    insertText: {
                        location: { index: 1 },
                        text: textBuffer
                    }
                },
                ...styleRequests
            ]
        }
    });

    return createRes.result;
};
