import { isGroupOwner } from '@/lib/auth/roles';
import { AIChatPanel } from '@/features/ai-chat/components/AIChatPanel';
import { redirect } from 'next/navigation';

export default async function AIChatPage({ params }: { params: Promise<{ groupId: string }> }) {
    const { groupId } = await params;
    if (!groupId || groupId === 'ai-chat') redirect('/dashboard');
    if (!await isGroupOwner(groupId)) redirect(`/${groupId}/dashboard`);
    return <div className="h-screen flex flex-col"><AIChatPanel groupId={groupId} /></div>;
}
