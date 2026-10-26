'use client';

import { useReportWebVitals } from 'next/web-vitals';

const report: Parameters<typeof useReportWebVitals>[0] = metric => {
    console.info('[Nexus performance]', {
        metric: metric.name, value: Number(metric.value.toFixed(2)),
        unit: metric.name === 'CLS' ? 'score' : 'ms', rating: metric.rating,
    });
};

// Only mounted by the explicit local performance build. Values stay in the
// WebView console; no session identifiers or data are sent to a service.
export function DesktopPerformance() {
    useReportWebVitals(report);
    return null;
}
