import { AdminPanel } from "@/features/admin/components/admin-panel";
import { getAdminSnapshotAction } from '@/features/admin/actions';
import { getSystemRole } from '@/lib/auth/roles';
import { redirect } from 'next/navigation';

export default async function AdminPage() {
    if (await getSystemRole() !== 'admin') redirect('/dashboard');
    return <AdminPanel initialData={await getAdminSnapshotAction()} />;
}
