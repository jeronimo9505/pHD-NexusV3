import { Suspense } from 'react';
import {
    DashboardHeader, DashboardReviews, DashboardMeetings,
    DashboardTasks, DashboardNotes, DashboardPlaceholder,
} from '@/features/dashboard/components/dashboard-sections';

export default async function GroupDashboardPage({ params }: { params: Promise<{ groupId: string }> }) {
    const { groupId } = await params;
    return <div className="space-y-6 animate-in fade-in-50 p-6">
        <Suspense fallback={<div className="h-16 animate-pulse rounded-xl bg-slate-100" />}>
            <DashboardHeader groupId={groupId} />
        </Suspense>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Suspense fallback={<DashboardPlaceholder />}><DashboardReviews groupId={groupId} /></Suspense>
            <Suspense fallback={<DashboardPlaceholder />}><DashboardMeetings groupId={groupId} /></Suspense>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Suspense fallback={<DashboardPlaceholder />}><DashboardTasks groupId={groupId} /></Suspense>
            <Suspense fallback={<DashboardPlaceholder />}><DashboardNotes groupId={groupId} /></Suspense>
        </div>
    </div>;
}
