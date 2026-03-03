import html2pdf from 'html2pdf.js';

/**
 * Generates a PDF from a DOM element and triggers a download.
 *
 * Contract:
 * - element: DOM node to render
 * - filename: output name (should end with .pdf)
 * - options: overrides for html2pdf.js
 */
export async function downloadPdfFromElement(element, {
    filename = 'report.pdf',
    options = {}
} = {}) {
    if (!element) throw new Error('Missing element');

    // html2pdf wraps html2canvas + jsPDF.
    // We pick conservative defaults that work well for A4 and text.
    const baseOptions = {
        margin: [12, 10, 12, 10], // mm-ish; html2pdf treats these as units used by jsPDF
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
    };

    const finalOptions = {
        ...baseOptions,
        ...options,
        html2canvas: { ...baseOptions.html2canvas, ...(options.html2canvas || {}) },
        jsPDF: { ...baseOptions.jsPDF, ...(options.jsPDF || {}) },
        pagebreak: { ...baseOptions.pagebreak, ...(options.pagebreak || {}) }
    };

    // Ensure we don't carry the app's background.
    const prevBg = element.style.backgroundColor;
    element.style.backgroundColor = '#ffffff';

    try {
        await html2pdf().set(finalOptions).from(element).save();
    } finally {
        element.style.backgroundColor = prevBg;
    }
}
