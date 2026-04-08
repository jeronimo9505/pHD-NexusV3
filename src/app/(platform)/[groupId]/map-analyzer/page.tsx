import { redirect } from 'next/navigation';
import { DesktopMapAnalyzer } from '@/features/map-analyzer/components/desktop-map-analyzer';
import { isDesktop } from '@/lib/desktop';

export default function MapAnalyzerPage({ params }: { params: { groupId: string } }) {
    return (
        <div className="h-[calc(100vh-theme(spacing.16))] w-full flex bg-slate-900 overflow-hidden">
            <DesktopMapAnalyzer groupId={params.groupId} />
        </div>
    );
}
