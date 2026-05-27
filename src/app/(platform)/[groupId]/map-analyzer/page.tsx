import { redirect } from 'next/navigation';
import { DesktopMapAnalyzer } from '@/features/map-analyzer/components/desktop-map-analyzer';
import { isDesktop } from '@/lib/desktop';

export default async function MapAnalyzerPage({ params }: { params: Promise<{ groupId: string }> }) {
    const { groupId } = await params;
    return (
        <div className="h-full w-full flex bg-slate-900 overflow-hidden">
            <DesktopMapAnalyzer groupId={groupId} />
        </div>
    );
}
