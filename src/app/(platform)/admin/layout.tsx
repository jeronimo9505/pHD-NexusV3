import { getSystemRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const systemRole = await getSystemRole();

    if (systemRole !== 'admin') {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {children}
        </div>
    );
}
